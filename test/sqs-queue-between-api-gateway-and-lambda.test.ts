import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import { App } from '@aws-cdk/core';
import { SqsQueueBetweenAPIGatewayAndLambda } from '../lib/sqs-queue-between-api-gateway-and-lambda';

test('Empty Stack', () => {
  const app = new App();
  // WHEN
  const stack = new SqsQueueBetweenAPIGatewayAndLambda(app, "MyTestStack");
  // THEN
  expectCDK(stack).to(matchTemplate({
    "Resources": {}
  }, MatchStyle.EXACT))
});
