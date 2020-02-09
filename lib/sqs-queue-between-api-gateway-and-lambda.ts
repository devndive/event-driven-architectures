import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { Table, AttributeType } from '@aws-cdk/aws-dynamodb';
import { Function, Code, Runtime } from '@aws-cdk/aws-lambda';
import { Queue } from '@aws-cdk/aws-sqs';
import { AwsIntegration, RestApi, PassthroughBehavior, EndpointType } from '@aws-cdk/aws-apigateway';

import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { Role, ServicePrincipal, PolicyStatement, Effect, PolicyDocument } from '@aws-cdk/aws-iam';
import { OrderStorage } from './order-storage';

export class SqsQueueBetweenAPIGatewayAndLambda extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const orderStorage = new OrderStorage(this, "OnlineSalesStorage");

    const incommingOrdersQueue = new Queue(this, "incomming-orders-queue");

    const saveOrderLambda = new Function(this, "save-order-function", {
      code: Code.fromAsset("src/lambda/save-order-function"),
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
  }
}
