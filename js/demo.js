$(document).ready(function () {
  var dropZone = $("#psd-drop").get(0);
  var psd;

  PSD.DEBUG = false;

  var handleDragOver = function (e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  var handleFile = function (e) {
    e.stopPropagation();
    e.preventDefault();

    var file = e.dataTransfer.files[0];
    if (file.type !== "image/vnd.adobe.photoshop") {
      $("#psd-output").html("<div class=\"alert alert-error\">Error: not a PSD file.</div>");
      return;
    }

    $("#psd-output").html("<div class=\"alert alert-success\">PSD file loaded, parsing...</div>");

    var reader = new FileReader();

    reader.onload = function (f) {
      var bytes = new Uint8Array(f.target.result);

      psd = new PSD(bytes);
      psd.parse();

      var psdInfo = {
        "Header Info": {
          Channels: psd.header.channels,
          Width: psd.header.cols,
          Height: psd.header.rows,
          Depth: psd.header.depth,
          Mode: psd.header.modename
        },
        "Layers": {}
      };

      var layer;
      for (var i = 0, _ref = psd.layerMask.layers.length; i < _ref; i++) {
        layer = psd.layerMask.layers[i];
        if (typeof layer.name === "undefined") {
          layer.name = "Layer " + i;
        }

        psdInfo.Layers[layer.name] = {
          "Position & Size": {
            Top: layer.top,
            Left: layer.left,
            Width: layer.cols,
            Height: layer.rows
          },
          "Blending Mode": {
            Type: layer.blendMode.blending,
            Opacity: Math.floor(layer.blendMode.opacp)
          },
          "Images": layer.images.length + " image(s)"
        };
      }

      outputPSDInfo(psdInfo);
    };

    reader.readAsArrayBuffer(file);
  };

  var outputPSDInfo = function (info) {
    var ul = listFromObject(info);
    $("#psd-output").html(ul);
  };

  var listFromObject = function (obj) {
    var ul = $("<ul />");

    $.each(obj, function (key, val) {
      var li = $("<li />");
      var html = key + ": ";
      
      if (typeof val === "object") {
        html += listFromObject(val).appendTo("<div />").parent().html();
      } else {
        html += val;
      }

      li.html(html);
      li.appendTo(ul);
    });

    return ul;
  };

  dropZone.addEventListener("dragover", handleDragOver, false);
  dropZone.addEventListener("drop", handleFile, false);
});