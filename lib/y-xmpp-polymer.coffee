XMPP = require './y-xmpp'

new Polymer 'y-xmpp',
  xmpp: new XMPP(), # this is a shared property indeed!
  ready: ()->
    @is_initialized = false
    @initialize()

  initialize: ()->
    if not @is_initialized and @room?
      @is_initialized = true
      options = {}
      if @syncMethod?
        options.syncMethod = @syncMethod
      this.connector = @xmpp.join(@room, options)
      if @debug?
        this.connector.debug = @debug

  roomChanged: ()->
    @initialize()
