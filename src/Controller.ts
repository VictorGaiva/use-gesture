import {
  EventOptions, 
  StateKey,
  State,
  Fn,
  ReactEventHandlerKey,
  ReactEventHandlers,
  InternalConfig,
  InternalHandlers,
  RecognizerClass,
} from './types'
import { getInitialState } from './utils/state'
import { chainFns } from './utils/utils'

type GestureTimeouts = Partial<{ [stateKey in StateKey]: number }>
type WindowListeners = Partial<{ [stateKey in StateKey]: [string, Fn][] }>
//type Bindings = Partial<{ [eventName in ReactEventHandlerKey]: Fn[] }>

/**
 * The controller will keep track of the state for all gestures and also keep
 * track of timeouts, and window listeners.
 *
 * @template BinderType the type the bind function should return
 */
export default class Controller {
  constructor(private classes: Set<RecognizerClass>) {}

  public bind = (...args: any[]) => {
    this.bindings = {}
    const domTarget = this.getDomTarget()
    if (domTarget) {
      removeListeners(domTarget, this.domListeners, this.config.eventOptions)
      this.domListeners = []
    }
    for (let RecognizerClass of this.classes) {
      new RecognizerClass(this, args).addBindings(this.bindings)
    }

    // we also add event bindings for native handlers
    for (let eventName in this.nativeRefs)
        addBindings(this.bindings,
          eventName,
          this.nativeRefs[eventName]
      )

    // If config.domTarget is set we add event listeners to it and return the clean function.
    if (this.isDomTargetDefined) return
    // If not, we return an object that contains gesture handlers mapped to react handler event keys.

    const bindings: ReactEventHandlers = {}
    const { eventOptions } = this.config
    const captureString = eventOptions.capture ? 'Capture' : ''

    Object.entries(this.bindings).forEach(([event, fns]) => {
      const fnsArray = Array.isArray(fns) ? fns : [fns]
      const key = (event + captureString) as ReactEventHandlerKey
      bindings[key] = chainFns(...(fnsArray as Fn[]))
    })

    return bindings
  }

  public effect = () => {
    if (this.isDomTargetDefined) {
      this.bind()
      this.addDomTargetListeners()
    }
    return this.clean
  }

  public nativeRefs!: any
  public config!: InternalConfig
  public handlers!: Partial<InternalHandlers>
  public state: State = getInitialState() // state for all gestures
  public timeouts: GestureTimeouts = {} // keeping track of timeouts for debounced gestures (such as move, scroll, wheel)
  private domListeners: [string, Fn][] = [] // when config.domTarget is set, we attach events directly to the dom
  private windowListeners: WindowListeners = {} // keeps track of window listeners added by gestures (drag only at the moment)
  private bindings: any = {} // an object holding the handlers associated to the gestures

  /**
   * Function ran on component unmount: cleans timeouts and removes dom listeners set by the bind function.
   */
  public clean = (): void => {
    this.bindings = {}
    const domTarget = this.getDomTarget()
    if (domTarget) {
      removeListeners(domTarget, this.domListeners, this.config.eventOptions)
      this.domListeners = []
    }
    Object.values(this.timeouts).forEach(clearTimeout)
    Object.keys(this.windowListeners).forEach(stateKey => this.removeWindowListeners(stateKey as StateKey))
  }
  

  /**
   * Returns the domTarget element and parses a ref if needed.
   */
  private getDomTarget = (): EventTarget | null | undefined => {
    const { domTarget } = this.config
    return domTarget && 'current' in domTarget ? domTarget.current : domTarget
  }

  /**
   * Commodity function to let recognizers simply add listeners to config.window.
   */
  public addWindowListeners = (stateKey: StateKey, listeners: [string, Fn][]): void => {
    if (!this.config.window) return
    // we use this.windowListeners to keep track of the listeners we add
    this.windowListeners[stateKey] = listeners
    addListeners(this.config.window, listeners, this.config.eventOptions)
  }

  /**
   * Commodity function to let recognizers simply remove listeners to config.window.
   */
  public removeWindowListeners = (stateKey: StateKey): void => {
    if (!this.config.window) return
    const listeners = this.windowListeners[stateKey]
    if (listeners) {
      removeListeners(this.config.window, listeners, this.config.eventOptions)
      delete this.windowListeners[stateKey]
    }
  }

  /**
   * When config.domTarget is set, this function will add dom listeners to it
   */
  public addDomTargetListeners = (): void => {
    const target = this.getDomTarget()
    if (!target) return
    /** We iterate on the entries of this.binding for each event, then we chain
     * the array of functions mapped to it and push them to this.domListeners
     */

    for (let key in this.bindings) {
      // @ts-ignore
      const handlers: Function[] = this.bindings[key]
      const eventName = key.substr(2).toLowerCase()
      const handler = chainFns(...handlers)
      this.domListeners.push([eventName, handler])
    }

    addListeners(target, this.domListeners, this.config.eventOptions)
  }

  /**
   * this.bindings is an object which keys match ReactEventHandlerKeys.
   * Since a recognizer might want to bind a handler function to an event key already used by a previously
   * added recognizer, we need to make sure that each event key is an array of all the functions mapped for
   * that key.
   */
  public addBindings = (eventNames: string | string[], fn: Fn): void => {
    const eventNamesArray = !Array.isArray(eventNames) ? [eventNames] : eventNames
    eventNamesArray.forEach(eventName => {
      if (this.bindings[eventName]) this.bindings[eventName]!.push(fn)
      else this.bindings[eventName] = [fn]
    })
  }

  public get isDomTargetDefined() {
    return !!this.config.domTarget
  }
}


  /**
   * this.bindings is an object which keys match ReactEventHandlerKeys.
   * Since a recognizer might want to bind a handler function to an event key already used by a previously
   * added recognizer, we need to make sure that each event key is an array of all the functions mapped for
   * that key.
   */
  export function addBindings(bindings: any, eventNames: string | string[], fn: Fn): void  {
    const eventNamesArray = !Array.isArray(eventNames) ? [eventNames] : eventNames
    eventNamesArray.forEach(eventName => {
      if (bindings[eventName]) {
        bindings[eventName]!.push(fn)
      } else {
        bindings[eventName] = [fn]
      }
    })
  }





function addListeners(el: EventTarget, listeners: Array<[string, Fn]>, options: EventOptions) {
  for (let [eventName, eventHandler] of listeners) {
    el.addEventListener(eventName, eventHandler, options)
  }
}

function removeListeners(el: EventTarget, listeners: Array<[string, Fn]>, options: EventOptions) {
  for (let [eventName, eventHandler] of listeners) {
    el.removeEventListener(eventName, eventHandler, options)
  }
}
