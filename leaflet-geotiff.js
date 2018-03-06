// Ideas from:
// https://github.com/ScanEx/Leaflet.imageTransform/blob/master/src/L.ImageTransform.js
// https://github.com/BenjaminVadant/leaflet-ugeojson

// Depends on:
// https://github.com/constantinius/geotiff.js

// Note this will only work with ESPG:4326 tiffs

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	var L = require('leaflet');
	var GeoTIFF = require('geotiff');
}

L.LeafletGeotiff = L.ImageOverlay.extend({
	
	options: {
		arrowSize: 20,
		band: 0,
		image: 0,
		renderer: null
	},
	
    initialize: function (url, options) { 
        if(typeof(GeoTIFF) === 'undefined'){
            throw new Error("GeoTIFF not defined");
        };

		this._url = url;
        this.raster = {};
        L.Util.setOptions(this, options);

        if (this.options.bounds) {
            this._rasterBounds = L.latLngBounds(options.bounds);
        }
		if (this.options.renderer) {
			this.options.renderer.setParent(this);
		}

        this._getData();
    },
    setURL: function(newURL) {
		this._url = newURL;
        this._getData();
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
    _getData: function() {
        var self = this;
        var request = new XMLHttpRequest();  
        request.onload = function() {
            if (this.status >= 200 && this.status < 400) {
                self._parseTIFF(this.response);
            } //TODO else handle error
        };
        request.open("GET", this._url, true);
        request.responseType = "arraybuffer";
        request.send();
    },
    _parseTIFF: function (arrayBuffer) {
        this.tiff = GeoTIFF.parse(arrayBuffer);
        this.setBand(this.options.band);
  
        if (!this.options.bounds) {
            var image = this.tiff.getImage(this.options.image);
            var meta = image.getFileDirectory();
            var x_min = meta.ModelTiepoint[3];
            var x_max = x_min + meta.ModelPixelScale[0]*meta.ImageWidth;
            var y_min = meta.ModelTiepoint[4];
            var y_max = y_min - meta.ModelPixelScale[1]*meta.ImageLength;
            this._rasterBounds = L.latLngBounds([[y_min,x_min],[y_max,x_max]]);
            this._reset();
        }
    },
    setBand: function (band) {
        this.options.band = band;
        
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
    getValueAtLatLng: function (lat, lng) {
        try {
            var x = Math.floor(this.raster.width*(lng - this._rasterBounds._southWest.lng)/(this._rasterBounds._northEast.lng - this._rasterBounds._southWest.lng)); 
            var y = this.raster.height-Math.ceil(this.raster.height*(lat - this._rasterBounds._southWest.lat)/(this._rasterBounds._northEast.lat - this._rasterBounds._southWest.lat)); 
            var i = y*this.raster.width+x;
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
        if (this.raster.hasOwnProperty('data')) {
			var args = {};
            topLeft = this._map.latLngToLayerPoint(this._map.getBounds().getNorthWest()),
            size = this._map.latLngToLayerPoint(this._map.getBounds().getSouthEast())._subtract(topLeft);
            args.rasterPixelBounds = L.bounds(this._map.latLngToContainerPoint(this._rasterBounds.getNorthWest()),this._map.latLngToContainerPoint(this._rasterBounds.getSouthEast()));
            args.xStart = (args.rasterPixelBounds.min.x>0 ? args.rasterPixelBounds.min.x : 0);
            args.xFinish = (args.rasterPixelBounds.max.x<size.x ? args.rasterPixelBounds.max.x : size.x);
            args.yStart = (args.rasterPixelBounds.min.y>0 ? args.rasterPixelBounds.min.y : 0);
            args.yFinish = (args.rasterPixelBounds.max.y<size.y ? args.rasterPixelBounds.max.y : size.y);
            args.plotWidth = args.xFinish-args.xStart;
            args.plotHeight = args.yFinish-args.yStart;

            if ((args.plotWidth<=0) || (args.plotHeight<=0)) {
                console.log(this.options.name,' is off screen.');
                var plotCanvas = document.createElement("canvas");
                plotCanvas.width = size.x;
                plotCanvas.height = size.y;
                var ctx = plotCanvas.getContext("2d");
                ctx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);
                this._image.src = plotCanvas.toDataURL();
                return;
            }

            args.xOrigin = this._map.getPixelBounds().min.x+args.xStart;
            args.yOrigin = this._map.getPixelBounds().min.y+args.yStart;
            args.lngSpan = (this._rasterBounds._northEast.lng - this._rasterBounds._southWest.lng)/this.raster.width;
            args.latSpan = (this._rasterBounds._northEast.lat - this._rasterBounds._southWest.lat)/this.raster.height;

            //Draw image data to canvas and pass to image element
            var plotCanvas = document.createElement("canvas");
            plotCanvas.width = size.x;
            plotCanvas.height = size.y;
            var ctx = plotCanvas.getContext("2d");
            ctx.clearRect(0, 0, plotCanvas.width, plotCanvas.height);

			this.options.renderer.render(this.raster, plotCanvas, ctx, args);
   
            //Draw clipping polygon
            if (this.options.clip) {
                this._clipMaskToPixelPoints();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.rect(args.xStart-10,args.yStart-10,args.plotWidth+20,args.plotHeight+20);
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

	transform: function(rasterImageData, args) {
		//Create image data and Uint32 views of data to speed up copying
		var imageData = new ImageData(args.plotWidth, args.plotHeight);
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

		for (var y=0;y<args.plotHeight;y++) {
			var yUntransformed = ((args.yOrigin+y) / scale - transformationD) / transformationC;
			var currentLat = (2 * Math.atan(Math.exp(yUntransformed)) - (Math.PI / 2)) * d;
			var rasterY = this.raster.height-Math.ceil((currentLat - this._rasterBounds._southWest.lat)/args.latSpan);

			for (var x=0;x<args.plotWidth;x++) {
				//Location to draw to
				var index = (y*args.plotWidth+x);

				//Calculate lat-lng of (x,y)
				//This code is based on leaflet code, unpacked to run as fast as possible
				//Used to deal with TIF being EPSG:4326 (lat,lon) and map being EPSG:3857 (m E,m N)
				var xUntransformed = ((args.xOrigin+x) / scale - transformationB) / transformationA;
				var currentLng = xUntransformed * d;
				var rasterX = Math.floor((currentLng - this._rasterBounds._southWest.lng)/args.lngSpan); 

				var rasterIndex = (rasterY*this.raster.width+rasterX);

				//Copy pixel value
				outPixelsU32[index] = inPixelsU32[rasterIndex];
			}
		}
		return imageData;
	}

});

L.LeafletGeotiffRenderer = L.Class.extend({
	
	initialize: function(options) {		
        L.setOptions(this, options);
	},

	setParent: function(parent) {
		this.parent = parent;
	},

	render: function(raster, canvas, ctx, args) {
		throw new Error('Abstract class');
	}

});

L.leafletGeotiff = function (url, options) {
    return new L.LeafletGeotiff(url, options);
};

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = L;
}