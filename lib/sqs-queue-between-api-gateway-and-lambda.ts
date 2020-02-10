import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { Function, Code, Runtime } from '@aws-cdk/aws-lambda';

import { OrderStorage } from './order-storage';
import { RestApiWithIncommingQueue } from './rest-api-with-incomming-queue';

export class SqsQueueBetweenAPIGatewayAndLambda extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const orderStorage = new OrderStorage(this, "OnlineSalesStorage");

    const saveOrderLambda = new Function(this, "save-order-function", {
      code: Code.fromAsset("src/lambda/save-order-function"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        ORDERS_TABLE_NAME: orderStorage.table.tableName
      }
    });

    new RestApiWithIncommingQueue(this, "OnlineSalesAPI", {
      account: this.account,
      functionToHandleIncommingMessages: saveOrderLambda
    });

    orderStorage.table.grantWriteData(saveOrderLambda);
  }
}
