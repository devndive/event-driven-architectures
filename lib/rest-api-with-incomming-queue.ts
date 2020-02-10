import { Construct, Resource } from "@aws-cdk/core";
import { RestApi, EndpointType, AwsIntegration, PassthroughBehavior, Resource as ApiGwResource } from "@aws-cdk/aws-apigateway";
import { PolicyStatement, Effect, PolicyDocument, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import { Queue } from "@aws-cdk/aws-sqs";
import { Function } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";

export interface RestApiWithIncommingQueueProps {
    account: string;
    functionToHandleIncommingMessages: Function;
}

export class RestApiWithIncommingQueue extends Construct {
    public readonly ordersResource: ApiGwResource;

    constructor(scope: Construct, id: string, props: RestApiWithIncommingQueueProps) {
        super(scope, id);

        const incommingQueue = new Queue(this, "incomming-orders-queue");

        const onlineSalesApi = new RestApi(this, "online-sales-api", {
            restApiName: "Online Sales API",
            description: "API supporting the online sales",
            endpointTypes: [EndpointType.REGIONAL],
        });

        const verionResource = onlineSalesApi.root.addResource("v1");
        this.ordersResource = verionResource.addResource("orders");

        const sendMessageStatement = new PolicyStatement();
        sendMessageStatement.addActions("sqs:SendMessage");
        sendMessageStatement.effect = Effect.ALLOW;
        sendMessageStatement.addResources(incommingQueue.queueArn);

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
            path: `${props.account}/${incommingQueue.queueName}`,
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

        this.ordersResource.addMethod("POST", sqsIntegration, {
            methodResponses: [{
                statusCode: "200",
            }]
        });
    
        props.functionToHandleIncommingMessages.addEventSource(new SqsEventSource(incommingQueue))
    }
}
