import { Stack, StackProps, Construct, Duration } from "@aws-cdk/core";
import { OrderStorage } from "./order-storage";
import { Queue } from "@aws-cdk/aws-sqs";
import { Code, Runtime, Function } from "@aws-cdk/aws-lambda";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import { RestApi, EndpointType, AwsIntegration, PassthroughBehavior } from "@aws-cdk/aws-apigateway";
import { PolicyStatement, Effect, PolicyDocument, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import { OrderProcessingStepFunction } from "./order-processing-step-function";

export class OrchestratingLambdaFunctionsWithStepFunctions extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const orderStorage = new OrderStorage(this, "OnlineSalesStorage");
    const incommingOrdersQueue = new Queue(this, "IncommingOrdersQueue");

    const stepFunction = new OrderProcessingStepFunction(this, "OrderProcessingStepFunction", {
      orderStorageTable: orderStorage.table,
    })

    const passOrderToStepFunctionLambda = new Function(this, "pass-order-to-stepfunction", {
      code: Code.fromAsset("src/lambda/pass-order-to-stepfunction"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        STATE_MACHINE_ARN: stepFunction.stateMachine.stateMachineArn,
      }
    });

    passOrderToStepFunctionLambda.addEventSource(new SqsEventSource(incommingOrdersQueue))

    stepFunction.stateMachine.grantStartExecution(passOrderToStepFunctionLambda);

    const onlineSalesApi = new RestApi(this, "online-sales-api", {
      restApiName: "Online Sales API",
      description: "API supporting the online sales",
      endpointTypes: [EndpointType.REGIONAL],
    });

    const verionResource = onlineSalesApi.root.addResource("v1");
    const ordersResource = verionResource.addResource("orders");

    const sendMessageStatement = new PolicyStatement();
    sendMessageStatement.addActions("sqs:SendMessage");
    sendMessageStatement.effect = Effect.ALLOW;
    sendMessageStatement.addResources(incommingOrdersQueue.queueArn);

    const p = new PolicyDocument();
    p.addStatements(sendMessageStatement);

    const sqsIntegrationExecutionRole = new Role(this, "apigw-sqs-execution-role", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
      inlinePolicies: {
        "sqsSendMessage": p
      }
    });

    sqsIntegrationExecutionRole.addToPolicy(sendMessageStatement);

    const sqsIntegration = new AwsIntegration({
      service: "sqs",
      integrationHttpMethod: "POST",
      path: `${this.account}/${incommingOrdersQueue.queueName}`,
      options: {
        credentialsRole: sqsIntegrationExecutionRole,
        passthroughBehavior: PassthroughBehavior.NEVER,
        requestParameters: {
          "integration.request.header.Content-Type": "'application/x-www-form-urlencoded'"
        },
        requestTemplates: {
          "application/json": "Action=SendMessage&MessageBody=$input.body",
        },
        integrationResponses: [
          {
            selectionPattern: "200",
            statusCode: "200",
            responseTemplates: {
              "application/json": '{ messageId: $input.json("$.SendMessageResponse.SendMessageResult.MessageId") }'
            }
          }
        ],
      },
    });

    ordersResource.addMethod("POST", sqsIntegration, {
      methodResponses: [{
        statusCode: "200",
      }]
    });
  }
}