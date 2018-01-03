importScripts('geotiff.js');

onmessage = function (message) {
console.time('decode tiff');
    var arrayBuffer = message.data.data;
    var tiff = GeoTIFF.parse(arrayBuffer);
    var image = tiff.getImage(0);
    
    //Read raster in native type, may be float or int
    var data = image.readRasters({samples: [0]})[0];
    
    //Convert NaN to -9999 because WebGL doesn't know about NaN
    for (var i=0;i<data.length;i++) {
        if (isNaN(data[i])) {
            data[i] = -9999;
        }
    }
    
    // //Convert to float because leaflet-geotiff expects a Float32Array
    // data = new Float32Array(image.readRasters({samples: [0]})[0]);
    
    var width = image.getWidth();
    var height = image.getHeight();

    var meta = image.getFileDirectory();
    var x_min = meta.ModelTiepoint[3];
    var x_max = x_min + meta.ModelPixelScale[0]*meta.ImageWidth;
    var y_min = meta.ModelTiepoint[4];
    var y_max = y_min - meta.ModelPixelScale[1]*meta.ImageLength;
console.timeEnd('decode tiff');
    
    postMessage({
        'data_buffer':data.buffer,
        'width':width,
        'height':height,
        'bounds':[[y_min,x_min],[y_max,x_max]]
    }, [
        data.buffer,
    ]);
    self.close();
}