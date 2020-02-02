import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import WorkflowWithStepFunctions = require('../lib/workflow-with-step-functions-stack');

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new WorkflowWithStepFunctions.WorkflowWithStepFunctionsStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
