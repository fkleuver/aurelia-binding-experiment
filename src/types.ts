export interface OverrideContext {
  parentOverrideContext: OverrideContext | null;
  bindingContext: any;
}

// view instances implement this interface
export interface Scope {
  bindingContext: any;
  overrideContext: OverrideContext;
}

export interface LookupFunctions {
  bindingBehaviors(name: string): any;
  valueConverters(name: string): any;
}
