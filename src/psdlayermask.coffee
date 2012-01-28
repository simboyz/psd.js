class PSDLayerMask
  constructor: (@file, @header) ->
    @layers = []

  parse: ->
    maskSize = @file.readInt()
    pos = @file.tell()

    Log.debug "Layer mask size is #{maskSize}"

    if maskSize > 0
      layerInfoSize = Util.pad2(@file.readInt())

      if layerInfoSize > 0
        @numLayers = @file.readShortInt()

        if @numLayers < 0
          @numLayers = Math.abs @numLayers

        if @numLayers * (18 + 6 * @header.channels) > layerInfoSize
          throw "Unlikely number of #{@numLayers} layers for #{@header['channels']} with #{layerInfoSize} layer info size. Giving up."

        Log.debug "Found #{@numLayers} layer(s)"

        for i in [0...@numLayers]
          layer = new PSDLayer @file
          layer.parse(i)
          @layers.push layer

        for layer in @layers
          layer.getImageData()

        @layers.reverse()

      @file.seek maskSize

    baseLayer = new PSDLayer @file, true, @header
    rle = @file.readShortInt() is 1
    height = baseLayer.height

    if rle
      nLines = height * baseLayer.channelsInfo.length
      lineLengths = []
      for h in [0...nLines]
        lineLengths.push @readShortInt()

      baseLayer.getImageData(false, lineLengths)
    else
      baseLayer.getImageData(false)

    if not @layers.length
      @layers.push baseLayer

  groupLayers: ->
    parents = []
    for layer in @layers
      layer.parent = parents[parents.length - 1] or null
      layer.parents = parents[1..]

      continue if layer.layerType.code is 0

      if layer.layerType.code is 3 and parents.length > 0
        delete parents[parents.length - 1]
      else
        parents.push layer