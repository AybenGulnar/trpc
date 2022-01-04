import { AnyRouter, DataTransformer, inferRouterError } from '@trpc/server';
import { TRPCResponse } from '@trpc/server/rpc';
import { TRPCClientErrorLike } from '..';
import { observable } from '../rx/observable';
import { Observable, Observer, Unsubscribable } from '../rx/types';

export type OperationMeta = Record<string, unknown>;
export type Operation<TInput = unknown> = {
  id: number;
  type: 'query' | 'mutation' | 'subscription';
  input: TInput;
  path: string;
  meta: OperationMeta;
};

export type HTTPHeaders = Record<string, string | string[] | undefined>;

/**
 * The default `fetch` implementation has an overloaded signature. By convention this library
 * only uses the overload taking a string and options object.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<Response>;

export type LinkRuntimeOptions = Readonly<{
  /**
   * @deprecated to be moved to a link
   */
  transformer: DataTransformer;
  headers: () => HTTPHeaders | Promise<HTTPHeaders>;
  fetch: TRPCFetch;
  AbortController?: typeof AbortController;
}>;

export type OperationLink<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation;
  next: (
    op: Operation<TInput>,
    result: Observer<
      TRPCResponse<TOutput, inferRouterError<TRouter>>,
      TRPCClientErrorLike<TRouter>
    >,
  ) => Unsubscribable;
}) => Observable<
  TRPCResponse<TOutput, inferRouterError<TRouter>>,
  TRPCClientErrorLike<TRouter>
>;

export type TRPCLink<TRouter extends AnyRouter> = (
  opts: LinkRuntimeOptions,
) => OperationLink<TRouter>;

export function executeChain<
  TRouter extends AnyRouter,
  TInput = unknown,
  TOutput = unknown,
>(opts: {
  links: OperationLink<TRouter, TInput, TOutput>[];
  op: Operation<TInput>;
}): Observable<
  TRPCResponse<TOutput, inferRouterError<TRouter>>,
  TRPCClientErrorLike<TRouter>
> {
  const rootObservable = observable((observer) => {
    function execute(index = 0, op = opts.op, currentObservable = observer) {
      const observable$ = opts.links[index]({
        op,
        next(nextOp, result) {
          const observer = execute(index + 1, nextOp, currentObservable);

          return observer.subscribe(result);
        },
      });
      return observable$;
    }

    const obs$ = execute();
    const sub = obs$.subscribe(observer);

    return () => {
      sub.unsubscribe();
    };
  });
  return rootObservable;
}