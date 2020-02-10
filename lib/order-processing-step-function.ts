import { Construct, Duration } from "@aws-cdk/core";
import { Function, Code, Runtime } from "@aws-cdk/aws-lambda";
import { Table } from "@aws-cdk/aws-dynamodb";
import { StateMachine, Task, Choice, Condition } from "@aws-cdk/aws-stepfunctions";
import { InvokeFunction } from "@aws-cdk/aws-stepfunctions-tasks";

export interface OrderProcessingStepFunctionProps {
    orderStorageTable: Table;
}

export class OrderProcessingStepFunction extends Construct {
    public readonly stateMachine: StateMachine;

    constructor(scope: Construct, id: string, props: OrderProcessingStepFunctionProps) {
        super(scope, id);

        const saveOrderFunction = new Function(this, "SaveOrderFunction", {
            code: Code.fromAsset("src/lambda/save-order-function"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
                ORDERS_TABLE_NAME: props.orderStorageTable.tableName,
            }
        });

        props.orderStorageTable.grantWriteData(saveOrderFunction);

        const processPaymentFunction = new Function(this, "ProcessPaymentFunction", {
            code: Code.fromAsset("src/lambda/process-payment-function"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
            }
        });

        const paymentFailureFunction = new Function(this, "PaymentFailureFunction", {
            code: Code.fromAsset("src/lambda/payment-failure-function"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
            }
        });

        const sendOrderFunction = new Function(this, "SendOrderFunction", {
            code: Code.fromAsset("src/lambda/send-order-function"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
            }
        });

        const updateOrderFunction = new Function(this, "UpdateOrderFunction", {
            code: Code.fromAsset("src/lambda/update-order-function"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
                ORDERS_TABLE_NAME: props.orderStorageTable.tableName,
            }
        });

        const saveOrderJob = new Task(this, 'Save order job', {
            task: new InvokeFunction(saveOrderFunction),
            resultPath: '$'
        });

        const processPaymentJob = new Task(this, 'Process payment job', {
            task: new InvokeFunction(processPaymentFunction),
            resultPath: '$'
        });

        const paymentFailureJob = new Task(this, 'Payment failure job', {
            task: new InvokeFunction(paymentFailureFunction),
            resultPath: '$'
        });

        const sendOrderJob = new Task(this, 'Send order job', {
            task: new InvokeFunction(sendOrderFunction),
            resultPath: '$'
        });

        const updateOrderJob = new Task(this, 'Update order job', {
            task: new InvokeFunction(updateOrderFunction),
            resultPath: '$'
        });

        const stepFunctionDefinition = saveOrderJob
            .next(processPaymentJob)
            .next(new Choice(this, 'Payment successful?')
                .when(Condition.stringEquals('$.order.paymentStatus', 'SUCCEEDED'), sendOrderJob)
                .when(Condition.stringEquals('$.order.paymentStatus', 'FAILED'), paymentFailureJob)
                .otherwise(paymentFailureJob)
                .afterwards().next(updateOrderJob)
            );

        this.stateMachine = new StateMachine(this, "OrderProcessingStateMachine", {
            definition: stepFunctionDefinition,
            timeout: Duration.minutes(1)
        });
    }
}
