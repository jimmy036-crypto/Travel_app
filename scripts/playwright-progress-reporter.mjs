// Emit bounded metadata immediately, so a killed worker still leaves its last
// started test/hook in CI logs. Never log step arguments, URLs or form values.
export default class ProgressReporter {
  log(event, test, result, extra = {}) {
    console.log('[e2e-progress]', JSON.stringify({
      time: new Date().toISOString(),
      event,
      project: test.parent.project()?.name,
      file: test.location.file.replaceAll('\\', '/').split('/e2e/').pop(),
      line: test.location.line,
      retry: result.retry,
      worker: result.workerIndex,
      ...extra,
    }));
  }

  onTestBegin(test, result) {
    this.log('test-start', test, result);
  }

  onTestEnd(test, result) {
    this.log('test-end', test, result, {
      status: result.status,
      durationMs: result.duration,
    });
  }

  onStepBegin(test, result, step) {
    if (step.category === 'hook') this.log('hook-start', test, result);
  }

  onStepEnd(test, result, step) {
    if (step.category === 'hook') {
      this.log('hook-end', test, result, {
        failed: Boolean(step.error),
        durationMs: step.duration,
      });
    }
  }
}
