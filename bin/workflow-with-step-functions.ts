#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { WorkflowWithStepFunctionsStack } from '../lib/workflow-with-step-functions-stack';

const app = new cdk.App();
new WorkflowWithStepFunctionsStack(app, 'WorkflowWithStepFunctionsStack');
