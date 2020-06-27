import { Construct, Stack, Resource, StackProps } from "@aws-cdk/core";
import { CfnApiV2, CfnIntegrationV2, CfnRouteV2, CfnDeploymentV2, CfnStageV2 } from "@aws-cdk/aws-apigateway";
import { Function, Code, Runtime, CfnFunction } from "@aws-cdk/aws-lambda";
import { PolicyStatement, Effect, PolicyDocument, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import { OrderStorage } from "./order-storage";
import { OrderProcessingStepFunction } from "./order-processing-step-function";
import { RestApiWithIncommingQueue } from "./rest-api-with-incomming-queue";
import { WebSocketStorage } from "./websocket-storage";

export class WebSocketApi extends Stack {

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id);

        const orderStorage = new OrderStorage(this, "OnlineSalesStorage");
        const webSocketStorage = new WebSocketStorage(this, "WebSocketStorage");

        const stepFunction = new OrderProcessingStepFunction(this, "OrderProcessingStepFunction", {
            orderStorageTable: orderStorage.table,
        });

        const passOrderToStepFunctionLambda = new Function(this, "pass-order-to-stepfunction", {
            code: Code.fromAsset("src/lambda/websocket-api/pass-order-to-stepfunction"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
                STATE_MACHINE_ARN: stepFunction.stateMachine.stateMachineArn,
                WEBSOCKET_STORAGE_TABLE: webSocketStorage.table.tableName
            }
        });

        stepFunction.stateMachine.grantStartExecution(passOrderToStepFunctionLambda);
        webSocketStorage.table.grantWriteData(passOrderToStepFunctionLambda);

        const restApi = new RestApiWithIncommingQueue(this, "OnlineSalesAPI", {
            account: this.account,
            functionToHandleIncommingMessages: passOrderToStepFunctionLambda
        });

        const wss = new CfnApiV2(scope, "WSSId", {
            name: "Online Sales Status API",
            protocolType: "WEBSOCKET",
            routeSelectionExpression: "$request.body.message"
        });

        const connectFunction = new Function(scope, "ConnectFunction", {
            code: Code.fromAsset("src/lambda/websocket-api/connect-function"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
            }
        });

        const disconnectFunction = new Function(scope, "DisconnectFunction", {
            code: Code.fromAsset("src/lambda/websocket-api/disconnect-function"),
            runtime: Runtime.NODEJS_12_X,
            handler: "index.handler",
            environment: {
            }
        });
        
        const invokeFunctionStatement = new PolicyStatement();
        invokeFunctionStatement.addActions("lambda:InvokeFunction");
        invokeFunctionStatement.effect = Effect.ALLOW;
        invokeFunctionStatement.addResources(connectFunction.functionArn);

        const p = new PolicyDocument();
        p.addStatements(invokeFunctionStatement);

        const lambdaInvocationRole = new Role(this, "ApiGWLambdaInvokationRole", {
            assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
            inlinePolicies: {
                "ExecuteConnectLambdaFunction": p
            }
        });

        lambdaInvocationRole.addToPolicy(invokeFunctionStatement);

        const connectIntegration = new CfnIntegrationV2(scope, "Integration", {
            apiId: wss.ref,
            credentialsArn: lambdaInvocationRole.roleArn,
            integrationType: "AWS_PROXY",
            integrationMethod: "POST",
            integrationUri: `arn:aws:apigateway:${scope.region}:lambda:path/2015-03-31/functions/${connectFunction.functionArn}/invocations`
        });
        connectIntegration.addDependsOn(connectFunction.node.defaultChild as CfnFunction);

        const route = new CfnRouteV2(scope, "Route", {
            apiId: wss.ref,
            routeKey: "$connect",
            target: `integrations/${connectIntegration.ref}`,
        });

        const deployment = new CfnDeploymentV2(scope, "WebSocketDeployment", {
            apiId: wss.ref
        });
        deployment.addDependsOn(route);

        const stage = new CfnStageV2(scope, "WebSocketStage", {
            apiId: wss.ref,
            deploymentId: deployment.ref,
            stageName: 'prod'
        });
    }
}
