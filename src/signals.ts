const signals: { [key: string]: any } = {};

export function connectBindingToSignal(binding: any, name: any): void {
  if (!signals.hasOwnProperty(name)) {
    signals[name] = 0;
  }
  binding.observeProperty(signals, name);
}

export function signalBindings(name: string | number): void {
  if (signals.hasOwnProperty(name)) {
    signals[name]++;
  }
}
