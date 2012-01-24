class Log
  @debug: @log = -> @output "log", arguments
  @output: (method, data) ->
    if exports?
      console[method].apply null, data if PSD.DEBUG
    else
      console[method]("[PSD]", data) if PSD.DEBUG