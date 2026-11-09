// The historical command probed production and uploaded to public storage.
// Fail before loading a browser, configuration, provider or network client.
console.error(
  'This performance runner is suspended. Use the local CI checks until a protected synthetic performance runner is reviewed.'
);
process.exitCode = 1;
