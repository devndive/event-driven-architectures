import { Stack, Construct, StackProps } from "@aws-cdk/core";
import { OrderStorage } from "./order-storage";
import { OrderProcessingStepFunction } from "./order-processing-step-function";
import { Code, Runtime, Function } from "@aws-cdk/aws-lambda";
import { RestApiWithIncommingQueue } from "./rest-api-with-incomming-queue";
import { LambdaIntegration } from "@aws-cdk/aws-apigateway";
import { WebSocketApi } from "./websocket-api";

export class ClientPolling extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const orderStorage = new OrderStorage(this, "OnlineSalesStorage");

    const stepFunction = new OrderProcessingStepFunction(this, "OrderProcessingStepFunction", {
      orderStorageTable: orderStorage.table,
    });

    const passOrderToStepFunctionLambda = new Function(this, "pass-order-to-stepfunction", {
      code: Code.fromAsset("src/lambda/pass-order-to-stepfunction"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        STATE_MACHINE_ARN: stepFunction.stateMachine.stateMachineArn,
      }
    });

    stepFunction.stateMachine.grantStartExecution(passOrderToStepFunctionLambda);

    const restApi = new RestApiWithIncommingQueue(this, "OnlineSalesAPI", {
      account: this.account,
      functionToHandleIncommingMessages: passOrderToStepFunctionLambda
    });
    
    const getStatusFunction = new Function(this, "GetStatusFunction", {
      code: Code.fromAsset("src/lambda/get-status-function"),
      runtime: Runtime.NODEJS_12_X,
      handler: "index.handler",
      environment: {
        ORDERS_TABLE_NAME: orderStorage.table.tableName,
      }
    });

    orderStorage.table.grantReadData(getStatusFunction);

    const getStatusIntegration = new LambdaIntegration(getStatusFunction, {});

    const orderIdResource = restApi.ordersResource.addResource("{orderId}");
    const getOrderStatus = orderIdResource.addResource("status");
    getOrderStatus.addMethod("GET", getStatusIntegration);
  }
}