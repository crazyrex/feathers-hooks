import { hooks as utils } from 'feathers-commons';

import * as hooks from './bundled';
import { addHookMethod, processHooks } from './commons';

function isPromise(result) {
  return typeof result !== 'undefined' &&
    typeof result.then === 'function';
}

function hookMixin(service){
  if(typeof service.mixin !== 'function') {
    return;
  }

  const app = this;
  const methods = app.methods;
  const oldBefore = service.before;
  const oldAfter = service.after;
  const mixin = {};

  addHookMethod(service, 'before', methods);
  addHookMethod(service, 'after', methods);

  methods.forEach(method => {
    if(typeof service[method] !== 'function') {
      return;
    }

    mixin[method] = function() {
      // A reference to the original method
      const _super = this._super.bind(this);
      // Create the hook object that gets passed through
      const hookObject = utils.hookObject(method, 'before', arguments);

      hookObject.app = app;

      // Process all before hooks
      return processHooks.call(this, this.__beforeHooks[method], hookObject)
        // Use the hook object to call the original method
        .then(hookObject => {
          if(typeof hookObject.result !== 'undefined') {
            return Promise.resolve(hookObject);
          }

          return new Promise((resolve, reject) => {
            const args = utils.makeArguments(hookObject);
            // The method may not be normalized yet so we have to handle both
            // ways, either by callback or by Promise
            const callback = function(error, result) {
              if(error) {
                reject(error);
              } else {
                hookObject.result = result;
                resolve(hookObject);
              }
            };

            // We replace the callback with resolving the promise
            args.splice(args.length - 1, 1, callback);

            const result = _super(... args);

            if(isPromise(result)) {
              result.then(data => callback(null, data), callback);
            }
          });
        })
        // Make a copy of hookObject from `before` hooks and update type
        .then(hookObject => Object.assign({}, hookObject, { type: 'after' }))
        // Run through all `after` hooks
        .then(processHooks.bind(this, this.__afterHooks[method]))
        // Finally, return the result
        .then(hookObject => hookObject.result);
    };
  });

  service.mixin(mixin);

  // Before hooks that were registered in the service
  if(oldBefore) {
    service.before(oldBefore);
  }

  // After hooks that were registered in the service
  if(oldAfter) {
    service.after(oldAfter);
  }
}

function configure() {
  return function() {
    this.mixins.unshift(hookMixin);
  };
}

configure.removeQuery = hooks.removeQuery;
configure.pluckQuery = hooks.pluckQuery;
configure.lowerCase = hooks.lowerCase;
configure.remove = hooks.remove;
configure.pluck = hooks.pluck;
configure.disable = hooks.disable;
configure.populate = hooks.populate;

export default configure;
