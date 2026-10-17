// Windows sandbox runtimes can deny os.userInfo(); tsx only needs a stable temp suffix.
if (typeof process.geteuid !== 'function') {
  process.geteuid = () => 0;
}
