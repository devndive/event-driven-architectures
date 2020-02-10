#!/usr/bin/env node
import 'source-map-support/register';
import { App } from '@aws-cdk/core';
import { SqsQueueBetweenAPIGatewayAndLambda } from '../lib/sqs-queue-between-api-gateway-and-lambda';
import { OrchestratingLambdaFunctionsWithStepFunctions } from '../lib/orchestrating-lambda-function-with-step-functions';
import { ClientPolling } from '../lib/client-polling';

const app = new App();
new SqsQueueBetweenAPIGatewayAndLambda(app, 'SqsQueueBetweenAPIGatewayAndLambdaStack');
new OrchestratingLambdaFunctionsWithStepFunctions(app, 'OrchestratingLambdaFunctionsWithStepFunctions');
new ClientPolling(app, 'ClientPolling');