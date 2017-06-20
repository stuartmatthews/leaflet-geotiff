// Ideas from:
// https://github.com/ScanEx/Leaflet.imageTransform/blob/master/src/L.ImageTransform.js
// https://github.com/BenjaminVadant/leaflet-ugeojson

// Depends on:
// https://github.com/santilland/plotty
// https://github.com/constantinius/geotiff.js

// Note this will only work with ESPG:4326 tiffs

if(typeof(plotty)=='undefined'){
    throw new Error("plotty not defined");
};

if(typeof(GeoTIFF)=='undefined'){
    throw new Error("GeoTIFF not defined");
};

L.LeafletGeotiff = L.ImageOverlay.extend({
    initialize: function (url, options) { 
        this.raster = {};
        if (options.bounds) {
            this._rasterBounds = L.latLngBounds(options.bounds);
        } 
        L.Util.setOptions(this, options);
        
        this.options.colorScale = (options.colorScale==undefined) ? 'viridis' : options.colorScale;
        this.options.clampLow = (options.clampLow==undefined) ? true : options.clampLow;
        this.options.clampHigh = (options.clampHigh==undefined) ? true : options.clampHigh;
        this.options.arrowSize = (options.arrowSize==undefined) ? 20 : options.arrowSize;
        
        this._preLoadColorScale(); //Make sure colorScale is ready even if image takes a while to load
        this._getData(url);
    },
    setURL: function(newURL) {
        this._getData(newURL);
    },
    onAdd: function (map) {
        this._map = map;
        if (!this._image) {
            this._initImage();
        }

        map._panes.overlayPane.appendChild(this._image);

        map.on('moveend', this._reset, this);
        
        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoom, this);
        }

        this._reset();
    },
    onRemove: function (map) {
        map.getPanes().overlayPane.removeChild(this._image);

        map.off('moveend', this._reset, this);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', this._animateZoom, this);
        }
    },
    _getData: function(url) {
        var self = this;
        var request = new XMLHttpRequest();  
        request.onload = function() {
            if (this.status >= 200 && this.status < 400) {
                self._parseTIFF(this.response);
            } //TODO else handle error
        };
        request.open("GET", url, true);
        request.responseType = "arraybuffer";
        request.send();
    },
    _parseTIFF: function (arrayBuffer) {
        this.tiff = GeoTIFF.parse(arrayBuffer);
        
        if (typeof(this.options.image)=='undefined') {
            this.options.image = 0;
        }
        if (typeof(this.options.band)=='undefined') {
            this.options.band = 0;
        }
        this.setBand(this.options.band);
  
        if (!this.options.bounds) {
            var image = this.tiff.getImage(this.options.image);
            var meta = image.getFileDirectory();
            var x_min = meta.ModelTiepoint[3];
            var x_max = x_min + meta.ModelPixelScale[0]*meta.ImageWidth;
            var y_min = meta.ModelTiepoint[4];
            var y_max = y_min - meta.ModelPixelScale[1]*meta.ImageLength;
            this._rasterBounds = L.latLngBounds([[y_min,x_min],[y_max,x_max]]);
            this._reset()
        }
    },
    setBand: function (band) {
        this.options.band = band
        
        var image = this.tiff.getImage(this.options.image);
        this.raster.data = image.readRasters({samples: [band]})[0];
        this.raster.width = image.getWidth();
        this.raster.height = image.getHeight();
        
        this._reset()
    },
    getRasterArray: function () {
        return this.raster.data;
    },
    getRasterCols: function () {
        return this.raster.width;
    },
    getRasterRows: function () {
        return this.raster.height;
    },
    setColorScale: function (colorScale) {
        this.options.colorScale = colorScale;
        this._reset();
    },
    setDisplayRange: function (min,max) {
        this.options.displayMin = min;
        this.options.displayMax = max;
        this._reset();
    },
    getValueAtLatLng: function (lat, lng) {
        try {
            var x = Math.floor(this.raster.width*(lng - this._rasterBounds._southWest.lng)/(this._rasterBounds._northEast.lng - this._rasterBounds._southWest.lng)); 
            var y = this.raster.height-Math.ceil(this.raster.height*(lat - this._rasterBounds._southWest.lat)/(this._rasterBounds._northEast.lat - this._rasterBounds._southWest.lat)); 
            var i = y*this.raster.width+x
            return this.raster.data[i];
        }
        catch(err) {
            return undefined;
        }
    },
	_animateZoom: function (e) {
        if (L.version >= "1.0") {
            var scale = this._map.getZoomScale(e.zoom),
                offset = this._map._latLngBoundsToNewLayerBounds(this._map.getBounds(), e.zoom, e.center).min;
            L.DomUtil.setTransform(this._image, offset, scale);
        } else {
            var scale = this._map.getZoomScale(e.zoom),
                nw = this._map.getBounds().getNorthWest(),
                se = this._map.getBounds().getSouthEast(),
                topLeft = this._map._latLngToNewLayerPoint(nw, e.zoom, e.center),
                size = this._map._latLngToNewLayerPoint(se, e.zoom, e.center)._subtract(topLeft);
            this._image.style[L.DomUtil.TRANSFORM] =
		        L.DomUtil.getTranslateString(topLeft) + ' scale(' + scale + ') ';
        }
	},
    _reset: function () {
        if (this.hasOwnProperty('_map')) {
            if (this._rasterBounds) {
                topLeft = this._map.latLngToLayerPoint(this._map.getBounds().getNorthWest()),
                size = this._map.latLngToLayerPoint(this._map.getBounds().getSouthEast())._subtract(topLeft);

                L.DomUtil.setPosition(this._image, topLeft);
                this._image.style.width  = size.x + 'px';
                this._image.style.height = size.y + 'px';

                this._drawImage();
            };
        };
    },
    _preLoadColorScale: function () {
        var canvas = document.createElement('canvas');
        var plot = new plotty.plot({
            canvas: canvas, data: [0],
            width: 1, height: 1,
            domain: [this.options.displayMin, this.options.displayMax], 
            colorScale: this.options.colorScale,
            clampLow: this.options.clampLow,
            clampHigh: this.options.clampHigh,
        });
        this.colorScaleData = plot.colorScaleCanvas.toDataURL();            
    },
    setClip: function(clipLatLngs) {
        this.options.clip = clipLatLngs;
        this._reset();
    },
    _clipMaskToPixelPoints: function() {
        if (this.options.clip) {
            var topLeft = this._map.latLngToLayerPoint(this._map.getBounds().getNorthWest());
            var pixelClipPoints = [];
            for (var p = 0; p < this.options.clip.length; p++) {
                var mercPoint = this._map.latLngToLayerPoint(this.options.clip[p]),
                    pixel = L.point(mercPoint.x - topLeft.x, mercPoint.y - topLeft.y);
                pixelClipPoints.push(pixel);
            }
            this._pixelClipPoints = pixelClipPoints;
        } else {
            this._pixelClipPoints = undefined;
        }
    },
    _drawImage: function () {
        var self = this;
        if (self.raster.hasOwnProperty('data')) {
            topLeft = this._map.latLngToLayerPoint(this._map.getBounds().getNorthWest()),
            size = this._map.latLngToLayerPoint(this._map.getBounds().getSouthEast())._subtract(topLeft);
            var rasterPixelBounds = L.bounds(this._map.latLngToContainerPoint(this._rasterBounds.getNorthWest()),this._map.latLngToContainerPoint(this._rasterBounds.getSouthEast()))
            var xStart = (rasterPixelBounds.min.x>0 ? rasterPixelBounds.min.x : 0);
            var xFinish = (rasterPixelBounds.max.x<size.x ? rasterPixelBounds.max.x : size.x);
            var yStart = (rasterPixelBounds.min.y>0 ? rasterPixelBounds.min.y : 0);
            var yFinish = (rasterPixelBounds.max.y<size.y ? rasterPixelBounds.max.y : size.y);
            var plotWidth = xFinish-xStart;
            var plotHeight = yFinish-yStart;
            
            if ((plotWidth<=0) || (plotHeight<=0)) {
                console.log(this.options.name,' is off screen.');
                var plotCanvas = document.createElement("canvas");
                plotCanvas.width = size.x;
                plotCanvas.height = size.y;
                var ctx = plotCanvas.getContext("2d");
                ctx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);
                this._image.src = plotCanvas.toDataURL();
                return;
            }

            var xOrigin = this._map.getPixelBounds().min.x+xStart;
            var yOrigin = this._map.getPixelBounds().min.y+yStart;
            var lngSpan = (this._rasterBounds._northEast.lng - this._rasterBounds._southWest.lng)/this.raster.width;
            var latSpan = (this._rasterBounds._northEast.lat - this._rasterBounds._southWest.lat)/this.raster.height;

            //Draw image data to canvas and pass to image element
            var plotCanvas = document.createElement("canvas");
            plotCanvas.width = size.x;
            plotCanvas.height = size.y;
            var ctx = plotCanvas.getContext("2d");
            ctx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);

            if (this.options.vector==true) {
                var arrowSize = this.options.arrowSize;
                var zoom = this._map.getZoom();
                var gridPxelSize = (rasterPixelBounds.max.x - rasterPixelBounds.min.x) / self.raster.width;
                var stride = Math.max(1,Math.floor(1.2*arrowSize/gridPxelSize)); 

                for (var y=0;y<self.raster.height;y=y+stride) {
                    for (var x=0;x<self.raster.width;x=x+stride) {
                        var rasterIndex = (y*this.raster.width+x);
                        if (self.raster.data[rasterIndex]>=0) { //Ignore missing values
                            //calculate lat-lon of of this point
                            var currentLng = this._rasterBounds._southWest.lng + (x+0.5)*lngSpan;
                            var currentLat = this._rasterBounds._northEast.lat - (y+0.5)*latSpan;
                                                    
                            //convert lat-lon to pixel cordinates
                            var projected = this._map.latLngToContainerPoint(L.latLng(currentLat,currentLng)); //If slow could unpack this calculation
                            var xProjected = projected.x;
                            var yProjected = projected.y;

                            //draw an arrow
                            ctx.save();
                            ctx.translate(xProjected, yProjected);
                            ctx.rotate((90+self.raster.data[rasterIndex])*Math.PI/180);
                            ctx.beginPath();
                            ctx.moveTo(-arrowSize/2, 0);
                            ctx.lineTo(+arrowSize/2, 0);
                            ctx.moveTo(arrowSize*0.25, -arrowSize*0.25);
                            ctx.lineTo(+arrowSize/2, 0);
                            ctx.lineTo(arrowSize*0.25, arrowSize*0.25);
                            ctx.stroke();
                            ctx.restore();
                        }
                    }
                }
            } else {
                var plottyCanvas = document.createElement("canvas");
                var plot = new plotty.plot({
                    data: self.raster.data,
                    width: self.raster.width, height: self.raster.height,
                    domain: [self.options.displayMin, self.options.displayMax], 
                    colorScale: this.options.colorScale,
                    clampLow: this.options.clampLow,
                    clampHigh: this.options.clampHigh,
                    canvas: plottyCanvas,
                    useWebGL: false,
                });
                plot.setNoDataValue(-9999); 
                plot.render();

                this.colorScaleData = plot.colorScaleCanvas.toDataURL();            
                var rasterImageData = plottyCanvas.getContext("2d").getImageData(0,0,plottyCanvas.width, plottyCanvas.height);

                //Create image data and Uint32 views of data to speed up copying
                var imageData = new ImageData(plotWidth, plotHeight);
                var outData = imageData.data;
                var outPixelsU32 = new Uint32Array(outData.buffer);
                var inData = rasterImageData.data;
                var inPixelsU32 = new Uint32Array(inData.buffer);

                var zoom = this._map.getZoom();
                var scale = this._map.options.crs.scale(zoom);
                var d = 57.29577951308232; //L.LatLng.RAD_TO_DEG;
                
                var transformationA = this._map.options.crs.transformation._a;
                var transformationB = this._map.options.crs.transformation._b;
                var transformationC = this._map.options.crs.transformation._c;
                var transformationD = this._map.options.crs.transformation._d;
                if (L.version >= "1.0") {
                    transformationA = transformationA*this._map.options.crs.projection.R;
                    transformationC = transformationC*this._map.options.crs.projection.R;
                }

                for (var y=0;y<plotHeight;y++) {
                    var yUntransformed = ((yOrigin+y) / scale - transformationD) / transformationC;
                    var currentLat = (2 * Math.atan(Math.exp(yUntransformed)) - (Math.PI / 2)) * d;
                    var rasterY = this.raster.height-Math.ceil((currentLat - this._rasterBounds._southWest.lat)/latSpan);
                    
                    for (var x=0;x<plotWidth;x++) {
                        //Location to draw to
                        var index = (y*plotWidth+x);

                        //Calculate lat-lng of (x,y)
                        //This code is based on leaflet code, unpacked to run as fast as possible
                        //Used to deal with TIF being EPSG:4326 (lat,lon) and map being EPSG:3857 (m E,m N)
                        var xUntransformed = ((xOrigin+x) / scale - transformationB) / transformationA;
                        var currentLng = xUntransformed * d;
                        var rasterX = Math.floor((currentLng - this._rasterBounds._southWest.lng)/lngSpan); 

                        var rasterIndex = (rasterY*this.raster.width+rasterX);

                        //Copy pixel value
                        outPixelsU32[index] = inPixelsU32[rasterIndex];
                    }
                }    
                ctx.putImageData(imageData, xStart, yStart); 
            }
   
            //Draw clipping polygon
            if (this.options.clip) {
                this._clipMaskToPixelPoints();
                ctx.globalCompositeOperation = 'destination-out'
                ctx.rect(xStart-10,yStart-10,plotWidth+20,plotHeight+20);
                //Draw vertices in reverse order
                for (var i = this._pixelClipPoints.length-1; i >= 0; i--) {
                    var pix = this._pixelClipPoints[i];
                    ctx['lineTo'](pix.x, pix.y);
                }
                ctx.closePath();
                ctx.fill();
            }
            
            this._image.src = String(plotCanvas.toDataURL());
        }
    },
});

L.leafletGeotiff = function (url, bounds, options) {
    return new L.LeafletGeotiff(url, bounds, options);
};
