# class: WebSocket

The [WebSocket] class represents websocket connections in the page.

## event: WebSocket.close
- type: <[WebSocket]>

Fired when the websocket closes.

## event: WebSocket.frameReceived
- type: <[Object]>
  - `payload` <[string]|[Buffer]> frame payload

Fired when the websocket recieves a frame.

## event: WebSocket.frameReceived
* langs: csharp, java
- type: <[WebSocketFrame]>

## event: WebSocket.frameSent
- type: <[Object]>
  - `payload` <[string]|[Buffer]> frame payload

Fired when the websocket sends a frame.

## event: WebSocket.frameSent
* langs: csharp, java
- type: <[WebSocketFrame]>

## event: WebSocket.socketError
- type: <[String]>

Fired when the websocket has an error.

## method: WebSocket.isClosed
- returns: <[boolean]>

Indicates that the web socket has been closed.

## method: WebSocket.url
- returns: <[string]>

Contains the URL of the WebSocket.

## async method: WebSocket.waitForEvent
* langs: csharp, js, python
  - alias-python: expect_event
- returns: <[any]>

Waits for event to fire and passes its value into the predicate function. Returns when the predicate returns truthy
value. Will throw an error if the webSocket is closed before the event is fired. Returns the event data value.

### param: WebSocket.waitForEvent.event
- `event` <[string]>

Event name, same one would pass into `webSocket.on(event)`.

### param: WebSocket.waitForEvent.optionsOrPredicate
* langs: js
- `optionsOrPredicate` <[function]|[Object]>
  - `predicate` <[function]> receives the event data and resolves to truthy value when the waiting should resolve.
  - `timeout` <[float]> maximum time to wait for in milliseconds. Defaults to `30000` (30 seconds). Pass `0` to disable timeout. The default value can be changed by using the [`method: BrowserContext.setDefaultTimeout`].

Either a predicate that receives an event or an options object. Optional.

## method: WebSocket.waitForFrameReceived
* langs: csharp, java
- returns: <[WebSocketFrame]>

Performs action and waits for a frame to be sent. If predicate is provided, it passes
[WebSocketFrame] value into the `predicate` function and waits for `predicate(webSocketFrame)` to return a truthy value.
Will throw an error if the WebSocket or Page is closed before the frame is received.

### option: WebSocket.waitForFrameReceived.predicate
- `predicate` <[function]\([WebSocketFrame]\):[boolean]>

Receives the [WebSocketFrame] object and resolves to truthy value when the waiting should resolve.

### option: WebSocket.waitForFrameReceived.timeout = %%-wait-for-event-timeout-%%

## method: WebSocket.waitForFrameSent
* langs: csharp, java
- returns: <[WebSocketFrame]>

Performs action and waits for a frame to be sent. If predicate is provided, it passes
[WebSocketFrame] value into the `predicate` function and waits for `predicate(webSocketFrame)` to return a truthy value.
Will throw an error if the WebSocket or Page is closed before the frame is sent.

### option: WebSocket.waitForFrameSent.predicate
- `predicate` <[function]\([WebSocketFrame]\):[boolean]>

Receives the [WebSocketFrame] object and resolves to truthy value when the waiting should resolve.

### option: WebSocket.waitForFrameSent.timeout = %%-wait-for-event-timeout-%%
