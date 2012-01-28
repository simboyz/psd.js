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

  ###
  Private data
  ###
  COMPRESSIONS =
    0: 'Raw'
    1: 'RLE'
    2: 'ZIP'
    3: 'ZIPPrediction'

  PIL_BANDS =
    'R': 0
    'G': 1
    'B': 2
    'A': 3
    'L': 0
  
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

    @parseHeader()
    @parseImageResources()
    @parseLayersMasks()
    @parseImageData()

    # TODO: benchmark info?
    Log.debug "Parsing finished"

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
    @parseHeader if not @header

    if not @resources
      @file.skipBlock('image resources')
      @resources = 'not parsed'

    Log.debug "\n### Layers & Masks ###"

    @layers = []
    @images = []
    @header.mergedalpha = false
    [misclen] = @file.readf ">L"

    if misclen
      miscstart = @file.tell()

      [layerlen] = @file.readf ">L"
      if layerlen
        # HACK HACK HACK
        # Not sure why subtraction needs to happen right now
        @numLayers = Math.pow(2, 16) - @file.readUInt16()
        if @numLayers < 0
          @numLayers *= -1
          Log.debug "First alpha transparency for merged image"
          @header.mergedalpha = true

        Log.debug "Layer info for #{@numLayers}:"

        if @numLayers * (18 + 6 * @header.channels) > layerlen
          throw "Unlikely number of #{@numLayers} layers for #{@header['channels']} with #{layerlen} layerlen. Giving up."

        linfo = []

        for i in [0...@numLayers]
          layer = new PSDLayer @file
          layer.parse()
          layers.push layer

        for i in [0...@numLayers]
          # Empty layer
          if linfo[i].rows * linfo[i].cols is 0
            @images.push null
            @parseImage linfo[i], true
            continue

          @images.push [0, 0, 0, 0]
          @parseImage linfo[i], true

          if linfo[i].channels is 2
            l = @images[i][0]
            a = @images[i][3]
            Log.debug 'LA', l, a
          else
            if typeof @images[i][3] is "number"
              # TEST
              @images[i] = new PSDImage 'RGB', @images[i][0...3]
            else
              # TEST
              @images[i] = new PSDImage 'RGBA', @images[i]

      else
        Log.debug "Layer info section is empty"

      skip = miscstart + misclen - @file.tell()
      if skip
        Log.debug "Skipped #{skip} bytes at end of misc data?"
        @file.seek skip
    
    else
      Log.debug "Misc info section is empty"

  parseImageData: ->
    @parseHeader() if not @header
    if not @resources
      @file.skipBlock('image resources')
      @resources = 'not parsed'
    if not @layers
      @file.skipBlock('image layers')
      @layers = 'not parsed'

    @mergedImage = []

    li = {}
    li.chids = [0...@header.channels]
    li.chlengths = []
    li.chlengths.push(null) for i in [0...@header.channels]
    [li.name, li.channels, li.rows, li.cols] = ['merged', @header.channels, @header.rows, @header.cols]
    li.layernum = -1

    @parseImage li, false
    switch li.channels
      when 1 then @mergedImage = @mergedImage[0]
      when 3 then @mergedImage = null # TODO Image.merge
      when 4 then @mergedImage = null
      else throw "Unsupported number of channels: #{li.channels}"
      


  parseImage: (li, isLayer = true) ->
    @parseHeader() if not @header
    if not @resources
      @file.skipBlock('image resources')
      @resources = 'not parsed'

    Log.debug "# Image: #{li.name}/#{li.channels}"

    if isLayer
      for ch in [0...li.channels]
        @parseChannel li, ch, 1, li.rows, li.cols, true
    else
      @parseChannel li, 0, li.channels, li.rows, li.cols, false

  ###
  li = layer info object
  idx = channel number
  count = number of channels to process
  rows, cols = dimensions
  isLayer = is this a layer?
  ###
  parseChannel: (li, idx, count, rows, cols, isLayer) ->
    chlen = li.chlengths[idx]
    if chlen isnt null and chlen < 2
      throw "Not enough channel data: #{chlen}"
    
    if li.chids[idx] is -2
      [rows, cols] = [li.mask.rows, li.mask.cols]

    rb = (cols * @header.depth * 7) / 8 # round to next byte

    # channel header
    chpos = @file.tell()
    comp = @file.readUInt16()

    chlen -= 2 if chlen
    pos = @file.tell()

    if cols * rows is 0
      return Log.debug "Empty channel, skipping"

    switch COMPRESSIONS[comp]
      when 'RLE'
        Log.debug "Handling RLE compressed data"
        rlecounts = 2 * count * rows
        
        if chlen and chlen < rlecounts
          throw "Channel too short for RLE row counts (need #{rlecounts} bytes, have #{chlen} bytes)"

        pos += rlecounts # image data starts after RLE counts
        rlecountsData = @file.readf ">#{count * rows}H"
        for ch in [0...count]
          rlelenForChannel = arraySum rlecountsData, ch * rows, (ch + 1) * rows
          data = @file.read rlelenForChannel
          channelName = CHANNEL_SUFFIXES[li.chids[idx]]

          channelName = 'L' if li.channels is 2 and channelName is 'B'

          p = new PSDImage 'L', cols, rows, data

          if isLayer
            @images[li.idx][PIL_BANDS[channelName]] = p
          else
            @mergedImage.push p

      when "Raw"
        Log.debug "Handling Raw compressed data"

        for ch in [0...count]
          data = @file.read cols * rows
          channelName = CHANNEL_SUFFIXES[li.chids[idx]]
          channelName = 'L' if li.channels is 2 and channelName is 'B'

          p = new PSDImage 'L', cols, rows, data

          if isLayer
            @images[li.idx][PIL_BANDS[channelName]] = p
          else
            @mergedImage.push p

      else 
        throw "Unsupported compression type: #{COMPRESSIONS[comp]}"
        

    if chlen isnt null and @file.tell() isnt (chpos + 2 + chlen)
      Log.debug "currentpos: #{@file.tell()} should be #{chpos + 2 + chlen}"
      @file.seek chpos + 2 + chlen, false

    return  