"""
Execute the first function that matches the given arguments.

Use this module to decorate multiple functions of the same name.  When called, 
all of the decorated functions will be tested in order to see if they accept 
the given arguments.  The first one that does will be invoked.  A TypeError 
will be raised if none of the functions can accept the arguments.

Examples:

>>> import signature_dispatch
>>> @signature_dispatch
... def f(x):
...    return x
...
>>> @signature_dispatch
... def f(x, y):
...    return x, y
...
>>> f(1)
1
>>> f(1, 2)
(1, 2)
>>> f(1, 2, 3)
Traceback (most recent call last):
    ...
TypeError: can't dispatch the given arguments to any of the candidate functions:
arguments: 1, 2, 3
candidates:
(x): too many positional arguments
(x, y): too many positional arguments
"""

import sys, inspect
from functools import update_wrapper
from typeguard import check_type, TypeCheckError
from typing import Dict, Tuple

__version__ = '1.0.1'

def dispatch(candidates, args, kwargs):
    """
    Search the given list of candidate functions for the first one that can 
    accept the given arguments, then execute that function.

    The caller must guarantee that at least one candidate function is provided.
    """
    assert candidates
    errors = []

    for f in candidates:
        sig = inspect.signature(f)
        try:
            bound_args = sig.bind(*args, **kwargs)
        except TypeError as err:
            errors.append(f"{sig}: {err}")
            continue

        try:
            _check_type_annotations(bound_args)
        except TypeCheckError as err:
            errors.append(f"{sig}: {err.name}: {err}")
            continue

        break

    else:
        arg_reprs = (f'{v!r}' for v in args)
        kwargs_reprs = (f'{k}={v!r}' for k, v in kwargs.items())
        arg_repr = ', '.join([*arg_reprs, *kwargs_reprs])
        raise TypeError("\n".join([
            "can't dispatch the given arguments to any of the candidate functions:",
            f"arguments: {arg_repr}",
            "candidates:",
            *errors,
        ]))

    return f(*args, **kwargs)


def _overload_via_local_name(f, priority, stack_depth):

    # Try to avoid using `inspect.stack()`: generating the whole stack is 
    # expensive.  I noticed that it increased the runtime of the autoprop test 
    # suite from ≈4s to ≈30s (although I was also building the dispatcher on 
    # each invocation, which is very wasteful).
    #
    # Some implementations of python don't support `inspect.currentframe()`, so 
    # in those cases I have to fall back on `inspect.stack()`.

    frame = inspect.currentframe()

    if frame is None:
        frame = inspect.stack()[stack_depth + 1].frame
    else:
        for i in range(stack_depth + 1):
            frame = frame.f_back

    try:
        name = f.__name__
        locals = frame.f_locals

        if name in locals:
            dispatcher = locals[name]
            if not hasattr(dispatcher, 'overload'):
                dispatcher = _make_dispatcher()
        else:
            dispatcher = _make_dispatcher()

        return dispatcher.overload(priority=priority)(f)

    finally:
        del frame

def _make_dispatcher():
    # The dispatcher needs to be a real function (e.g. not a class with a 
    # `__call__()` method) so that it will be bound when used on methods.
    candidates = []

    def dispatcher(*args, **kwargs):
        return dispatch(candidates, args, kwargs)

    # This next bit of code is a bit self-referential.  We want to use the 
    # signature-dispatching functionality provided by this module (because we 
    # want to support an optional `priority` argument), but we have to avoid 
    # using any of the convenient decorators provided by this module (because 
    # we're in the middle of implementing them).  So we use the `dispatch()` 
    # function directly.

    def overload_with_priority(*, priority):
        def decorator(f):
            if not candidates:
                update_wrapper(dispatcher, f)

            f.priority = priority
            candidates.append(f)
            candidates.sort(key=lambda f: f.priority, reverse=True)

            return dispatcher
        return decorator

    def overload_without_priority(f):
        return overload_with_priority(priority=0)(f)

    def overload(*args, **kwargs):
        return dispatch(
                [overload_with_priority, overload_without_priority],
                args, kwargs,
        )

    dispatcher.overload = overload
    return dispatcher

def _check_type_annotations(bound_args):
    for name, value in bound_args.arguments.items():
        param = bound_args.signature.parameters[name]
        if param.annotation is param.empty:
            continue

        if param.kind is param.VAR_POSITIONAL:
            expected_type = Tuple[param.annotation, ...]
        elif param.kind is param.VAR_KEYWORD:
            expected_type = Dict[str, param.annotation]
        else:
            expected_type = param.annotation

        try:
            check_type(value, expected_type)
        except TypeCheckError as err:
            err.name = name
            raise


# Hack to make the module directly usable as a decorator.  Only works for 
# python 3.5 or higher.  See this Stack Overflow post:
# https://stackoverflow.com/questions/1060796/callable-modules

class CallableModule(sys.modules[__name__].__class__):

    def __call__(self, *args, **kwargs):

        def with_priority(*, priority):
            def decorator(f):
                return _overload_via_local_name(f, priority, stack_depth=1)
            return decorator

        def without_priority(f):
            return _overload_via_local_name(f, 0, stack_depth=3)

        return dispatch([with_priority, without_priority], args, kwargs)

sys.modules[__name__].__class__ = CallableModule

