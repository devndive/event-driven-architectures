import { Stack, StackProps, Construct, Duration } from "@aws-cdk/core";
import { OrderStorage } from "./order-storage";
import { Queue } from "@aws-cdk/aws-sqs";
import { Code, Runtime, Function } from "@aws-cdk/aws-lambda";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";
import { RestApi, EndpointType, AwsIntegration, PassthroughBehavior } from "@aws-cdk/aws-apigateway";
import { PolicyStatement, Effect, PolicyDocument, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import { Task, Choice, Condition, StateMachine } from "@aws-cdk/aws-stepfunctions";
import { InvokeFunction } from "@aws-cdk/aws-stepfunctions-tasks";

export class OrchestratingLambdaFunctionsWithStepFunctions extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const orderStorage = new OrderStorage(this, "OnlineSalesStorage");

    const incommingOrdersQueue = new Queue(this, "incomming-orders-queue");

    const saveOrderLambda = new Function(this, "store-order-in-dynamodb", {
      code: Code.fromAsset("src/lambda/store-order-in-dynamodb"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        ORDERS_TABLE_NAME: orderStorage.table.tableName
      }
    });

    saveOrderLambda.addEventSource(new SqsEventSource(incommingOrdersQueue))

    orderStorage.table.grantReadWriteData(saveOrderLambda);

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


    const processPaymentFunction = new Function(this, "ProcessPaymentFunction", {
      code: Code.fromAsset("src/lambda/process-payment-function"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
      }
    });

    const paymentFailureFunction = new Function(this, "PaymentFailureFunction", {
      code: Code.fromAsset("src/lambda/process-payment-failure-function"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        ORDERS_TABLE_NAME: orderStorage.table.tableName
      }
    });

    const sendOrderFunction = new Function(this, "SendOrderFunction", {
      code: Code.fromAsset("src/lambda/process-payment-failure-function"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        ORDERS_TABLE_NAME: orderStorage.table.tableName
      }
    });

    const updateOrderFunction = new Function(this, "UpdateOrderFunction", {
      code: Code.fromAsset("src/lambda/update-order-function"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        ORDERS_TABLE_NAME: orderStorage.table.tableName
      }
    });

    const saveOrderJob = new Task(this, 'Save order job', {
      task: new InvokeFunction(saveOrderLambda),
      resultPath: '$.order'
    });

    const processPaymentJob = new Task(this, 'Process payment job', {
      task: new InvokeFunction(processPaymentFunction),
      resultPath: '$.order'
    });

    const paymentFailureJob = new Task(this, 'Payment failure job', {
      task: new InvokeFunction(paymentFailureFunction),
      resultPath: '$.order'
    });

    const sendOrderJob = new Task(this, 'Send order job', {
      task: new InvokeFunction(sendOrderFunction),
      resultPath: '$.order'
    });

    const updateOrderJob = new Task(this, 'Update order job', {
      task: new InvokeFunction(updateOrderFunction),
      resultPath: '$.order'
    });

    const stepFunctionDefinition = saveOrderJob
      .next(processPaymentJob)
      .next(new Choice(this, 'Payment successful?')
        .when(Condition.stringEquals('$.order.paymentStatus', 'SUCCEEDED'), sendOrderJob)
        .when(Condition.stringEquals('$.order.paymentStatus', 'FAILED'), paymentFailureJob)
      )
      .next(updateOrderJob);

    const stateMachine = new StateMachine(this, "OrderProcessingStateMachine", {
      definition: stepFunctionDefinition,
      timeout: Duration.minutes(1)
    })
  }
}