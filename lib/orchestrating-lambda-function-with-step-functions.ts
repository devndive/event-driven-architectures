import { Stack, StackProps, Construct } from "@aws-cdk/core";
import { OrderStorage } from "./order-storage";
import { Code, Runtime, Function } from "@aws-cdk/aws-lambda";
import { OrderProcessingStepFunction } from "./order-processing-step-function";
import { RestApiWithIncommingQueue } from "./rest-api-with-incomming-queue";

export class OrchestratingLambdaFunctionsWithStepFunctions extends Stack {
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

    new RestApiWithIncommingQueue(this, "OnlineSalesAPI", {
      account: this.account,
      functionToHandleIncommingMessages: passOrderToStepFunctionLambda
    });
  }
}