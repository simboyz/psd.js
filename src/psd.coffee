# NodeJS or browser?
if exports?
  Root = exports
  fs = require 'fs'
else
  Root = window

# Create our class and add to global scope
Root.PSD = class PSD
  @DEBUG = true

  @fromData: (data) -> new PSD data
  @fromFile: (filename) ->
    data = fs.readFileSync filename
    new PSD data

  @fromURL: (url) -> # TODO
  
  constructor: (data) ->
    @file = new PSDFile data

    @header = null
    @resources = null
    @numLayers = 0
    @layers = null
    @images = null
    @mergedImage = null

  parse: ->
    Log.debug "Beginning parsing"
    @startTime = (new Date()).getTime()

    @parseHeader()
    @parseImageResources()
    @parseLayersMasks()

    @endTime = (new Date()).getTime()
    Log.debug "Parsing finished in #{@endTime - @startTime}ms"

  parseHeader: ->
    Log.debug "\n### Header ###"

    @header = new PSDHeader @file
    @header.parse()

    Log.debug @header

  parseImageResources: ->
    Log.debug "\n### Resources ###"

    @resources = []

    [n] = @file.readf ">L"
    while n > 0
      resource = new PSDResource @file
      n -= resource.parse()

      Log.debug "Resource: ", resource

    Log.debug "Image resources overran expected size by #{-n} bytes" if n isnt 0

  parseLayersMasks: ->
    @parseHeader() if not @header

    if not @resources
      @file.skipBlock('image resources')
      @resources = 'not parsed'

    Log.debug "\n### Layers & Masks ###"

    @layerMask = new PSDLayerMask @file, @header
    @layerMask.parse()
