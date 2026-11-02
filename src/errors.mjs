export class RiverError extends Error {
  constructor(code, message, path = '', detail = {}, retryable = false) {
    super(message); this.name = 'RiverError'; this.code = code; this.path = path;
    this.detail = detail; this.retryable = retryable;
  }
  toJSON() { return {code:this.code,path:this.path,message:this.message,retryable:this.retryable,...this.detail}; }
}
export function fail(code,message,path='',detail={},retryable=false) { throw new RiverError(code,message,path,detail,retryable); }
export function check(condition,code,message,path='',detail={}) { if(!condition) fail(code,message,path,detail); }
export function errorJSON(error) { return error instanceof RiverError ? error.toJSON() : {code:'INTERNAL',path:'',message:error.message,retryable:false}; }
