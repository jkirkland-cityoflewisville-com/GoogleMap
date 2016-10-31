var app = angular.module('app',[]);
			
//....................................................................................
//SERVICE - Map
	app.service("svc_map",function(){
		var svc = this;
		
		//Map Object
			svc.map = new google.maps.Map(document.getElementById("map"), {
				zoom: 13,
				center: new google.maps.LatLng(33.04874516100256, -96.9571323598633)
			});
				
		//Event Listeners
			svc.addEventListener = function(_eventType,_action){
				google.maps.event.addListener(svc.map, _eventType, _action);
			}
			
		
		//```````````````````````
		return svc;
	});
	
//....................................................................................
//SERVICE - GIS Layers
	app.service("svc_layers",function($http, svc_utilities, svc_map, $interval, $timeout){
		
		var svc = this;
		
		svc.layers = [];
		svc.groups = [];
		svc.toggleOrder = [];
		
		//Get layers from Google Spreadsheet
		svc.get_layers = function(_callback) {
	
			$http.jsonp("https://spreadsheets.google.com/feeds/list/1q2t8kR4fme1D0Us2EZmsj3LjBQ2QxD0lfl2db68hF2Q/1/public/values?&alt=json-in-script&callback=JSON_CALLBACK&sq=label%3E%22%22%20and%20id%3C%3E%22ID%22")
			.success(function (_data) {
				if (_data){
					svc.layers = _data.feed.entry.map(function(e){
						var r = {};
						Object.keys(e).forEach(function(x){
							if(x.substr(0,4)=='gsx$' || x=='updated'){
								r[x.replace('gsx$','')] = e[x].$t;
							}
						});
						return r;
					});
					
					svc.formatLayersObject(_callback);
				}
			});
		}
		
		svc.formatLayersObject = function(_callback){
			
			svc.layers.forEach(function(e,_index){
				
				//Convert infowindow column names to lowercase
				if (e.infowindowcolumns){
					if (e.infowindowcolumns.split(",").length > 1){
						e.infowindowcolumns = e.infowindowcolumns.split(",").map(function(e){return e.toLowerCase()});
						
					}
				}
				
				//Active property
				e.active = false;
				
				//Toggle function
				e.toggle = function(){							
					var _layer = e;
					
					if (_layer.active == false){
						_layer.isloading = true;
						
						//Add _layer.name to svc.toggleOrder
							svc.toggleOrder.push(_layer.id);
							
						if ( _layer.filetype.toLowerCase() == "mapservice"){
							
							//Create a Google Map/Esri Map-Service Type (using arcgislink.js library). 
								_layer.mapService = new gmaps.ags.MapService(_layer.url);
								
							//Display the Esri Map-Service as an Google Map ImageOverlay Type
								_layer.mapoverlay = new gmaps.ags.MapOverlay(_layer.mapService, {
									opacity: _layer.opacity,
									
									__ZINDEX: (1000 + svc.toggleOrder.indexOf(_layer.id)),        // <---Custom property added to arcgislink.js module by JKIRKLAND 10/2016
									
									__doOnDrawStart: function(){                                  // <---Custom property added to arcgislink.js module by JKIRKLAND 10/2016
										
										$timeout(function(){
											_layer.isloading = true;
										},1)
									},
									
									__doOnDrawEnd: function(){                                    // <---Custom property added to arcgislink.js module by JKIRKLAND 10/2016
										
										$timeout(function(){
											_layer.isloading = false;
										},1)
									}
								});
							
							//Add this layer to the map
							_layer.mapoverlay.setMap(svc_map.map);
							
							if (_layer.refreshinterval){
								_layer.toggleInterval = $interval( function(){
									_layer.mapoverlay.refresh();
								}, (_layer.refreshinterval * 1000));
								
							}
							
							//console.log(_layer)
						}
					
					//Layer is already active. Turn it off
					}else{
						
						//Remove _layer from svc.toggleOrder
							svc.toggleOrder.splice(svc.toggleOrder.indexOf(_layer.id),1);
						
						//Remove the layer from the map
							if ( _layer.filetype.toLowerCase() == "mapservice"){								
								_layer.mapoverlay.setMap(null);
							}
							
						//Cancel any $intervals
							if (_layer.toggleInterval){
								$interval.cancel(_layer.toggleInterval);
							}
					}
					
					_layer.active = !_layer.active
				}
			});
		
		//svc.groups
			var _groups = svc.layers.map(function(obj) { 
				return {
					id: obj.groupid, 
					name: obj.groupname, 
					order: obj.grouporder
				}; 
			});
			
			svc.groups = $.unique(_groups.map(function(d) {	// <--- jQuery $.unique() function
				return d.id + '|' + d.name + '|' + d.order;
			})).map(function(e){
				return {
					id: e.split('|')[0],
					name: e.split('|')[1],
					order: e.split('|')[2]
				} 
			});
			
			//Callback
			if (_callback){
				_callback();
			}
		}
		
		svc.activeLayers = svc.layers.filter(function(e){
			return e.active == true;
		});
		
		
		//```````````````````````
		return svc;
	});

//....................................................................................
//SERVICE - Infowindows (/Identify ArcGIS MapServer Feature when clicked)
	app.service("svc_infowindows",function(svc_map, svc_layers){
		var svc = this;	
		
		//```````````````````````````````````````````
			var overlayOptions = {
			  polylineOptions: {
				strokeColor: '#00FFFF',
				strokeWeight: 4
			  },
			  polygonOptions: {
				fillColor: '#FFFF99',
				fillOpacity: 0.9,
				strokeWeight: 6,
				strokeColor: '#00FFFF',
				zIndex: 99999
			  }
			};
			
		//```````````````````````````````````````````
			var infowindow = {
				object: new google.maps.InfoWindow({
					pixelOffset: new google.maps.Size(0,50)  //Puts the infowindow at the position clicked
				}),
				
				create: function(_d){
					var _map = _d.map;
					var _marker = _d.marker;
					
					//Open the window
						infowindow.object.open(_map, _marker);	
					
					//Do on infowindow close
						google.maps.event.addListener(infowindow.object,'closeclick',function(){
							//remove marker
								_marker.setMap(null);
								
							//Remove highlightedFeatures
								for (var i in highlightedFeatures){
									highlightedFeatures[i].setMap(null);
								}
						});
				},
				
				marker_invisible: new google.maps.Marker({					
					map: svc_map.map,
					opacity: 0
				}),
				setMarkerPosition: function(_latlng){
					infowindow.marker_invisible.setPosition(_latlng);
				},
				
				content: [],				
				addContent: function(_newContent){
					infowindow.content.push(_newContent);					
					infowindow.object.setContent(infowindow.content.join(''));
				},
				clearContent: function(){
					infowindow.object.setContent('');
					infowindow.content = [];
				}
			};
					
				
		//```````````````````````````````````````````
		//Called by Controller "ctrl_map" in svc_map.addEventListener('click', svc_infowindows.identify);
			svc.identify = function(_evt) {	
				
				var _activeLayers = svc_layers.layers.filter(function(e){
					var _active = e.active || false;
					var _hide = e.infowindowhide || 'false';
					return _active == true && _hide != true && _hide.toLowerCase() != "true";
				});	
				
				
				clearOverlays();
				
				var _infowindow_tabs = '';
				var _infowindow_detail = '';
				var _loopcount = 0;
				
				_activeLayers.forEach(function(_lyr){					
					
					//ArcGISLink.js identity() function calls ArcGIS MapServer/identify function
					_lyr.mapService.identify(
						{
							'geometry': _evt.latLng,
							'tolerance': 3,
							'layerOption': 'all',
							'bounds': svc_map.map.getBounds(),
							'width': svc_map.map.getDiv().offsetWidth,
							'height': svc_map.map.getDiv().offsetHeight,
							'overlayOptions': overlayOptions
						}, 
						function(_queryResults, err) {
							if (err) {
								alert(err.message + err.details.join('\n'));
							} else {
								
								if (_queryResults.results){
									console.log("infowindow queryresults");
									console.log(_queryResults)
									
									var _name = _queryResults.results[0].layerName || '';
									var _attributes = _queryResults.results[0].feature.attributes;
									var _geometry = _queryResults.results[0].feature.geometry;
																		
									//Html					
										var _html = '';
										for (var attr in _attributes){											
											var _value = _attributes[attr];
											
											//Only show columns list in the layer-settings
											if (_lyr.infowindowcolumns.indexOf(attr.toLowerCase().replace(/ /g,'_')) >= 0 ){
												
												//Wrap urls in anchor tag
													if ( _value.substr(0,4) == 'http'){
														_value = '<a href="' + _value + '">Link</a>';
													}							
												//Table rows
													_html += '<tr><td><b style="text-decoration: underline;">' + attr  + '</b></td></tr>';
													_html += '<tr><td>' + _value + '</td></tr>';
													_html += '<tr><td><br></td></tr>';
											}
										}
										_infowindow_detail += '<h4>' + _name + '</h4><table>' + _html + '</table><br>';
										
									//Callback
										_loopcount += 1;
										
										if (_loopcount == _activeLayers.length){
											 
											//Add html to infowindow
												infowindow.addContent(_infowindow_detail);
										
											//Create hidden infowindow-marker
												var _marker = new google.maps.Marker({	
													position: _evt.latLng,
													map: svc_map.map,
													opacity: 0
												})
											
											//Open infowindow	
												infowindow.create({
													map: svc_map.map, 
													marker: _marker
												});
												

											//Highlight feature
												if (_activeLayers.length == 1){
													showFeature(_geometry);
												}
										} //end if
								} //end if
							} //end if
						}
					); //end identify	

					
					
				}); //end activeLayers.forEach
				
			};
			
			
		//```````````````````````````````````````````
			var clearOverlays = function() {

				infowindow.object.close();
				infowindow.clearContent();
				
				if (infowindow.marker){
					infowindow.marker.setMap(null);
				}
			};
			
		//```````````````````````````````````````````
			var highlightedFeatures = [];	
			var showFeature = function(_geometry) {			 
			  if (_geometry) {
				if (highlightedFeatures.length > 0){
					for (var i in highlightedFeatures){
						highlightedFeatures[i].setMap(null);
					}
				}
				for (var i = 0; i < _geometry.length; i++) {
					highlightedFeatures[i] = _geometry[i]
					highlightedFeatures[i].setMap(svc_map.map);
				}
			  }
        }
			
		//```````````````````````
		return svc;
	});


//....................................................................................	
//SERVICE - Utility Functions
	app.service("svc_utilities",function(){
		var svc = this;

		//URL Parameters
			svc.getURLParameter = function(name) {
				return decodeURIComponent((new RegExp('[?|&]' + name.toLowerCase() + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search.toLowerCase())||[,""])[1].replace(/\+/g, '%20'))||null;
			};
		//Json property-names to lower case
			svc.JsonPropsToLower = function(_json){
				return JSON.parse(JSON.stringify(_json).replace(/"([^"]+)":/g, function ($0, $1) {return ('"' + $1.toLowerCase() + '":');}));
			};	
		return svc;
	});
	
//....................................................................................	
//SERVICE - Google Layers
	app.service("svc_googleLayers",function(svc_map){
		var svc = this;
		
		svc.layers = [
			{
				id: "TrafficLayer",
				label: "Google Traffic",
				icon: "road",
				active: false,
				mapservice: [],
				toggle: function(){
					var that = this;
					if (that.active == false){
						that.mapservice = new google.maps.TrafficLayer();
						that.mapservice.setMap(svc_map.map);
					}else{
						that.mapservice.setMap(null);
					}
					that.active = !that.active;
				}
			}
		];
		
		return svc;
	});

//....................................................................................	
//SERVICE - Legend - used by ctrl_layers to pass data to legend-directive
	app.service("svc_legend",function(svc_map){
		var svc = this;
		svc.items = [];
		
		return svc;
	});

	
//....................................................................................
//CONTROLLER - ctrl_map
	app.controller("ctrl_map",['svc_map','svc_infowindows','svc_googleLayers',
	  function(svc_map,svc_infowindows,svc_googleLayers){
		var ctrl = this;
		
		//Google Layers (traffic,bicycling,weather, etc)
			ctrl.googleLayers = svc_googleLayers.layers;
				
		//Map click event
			svc_map.addEventListener('click', svc_infowindows.identify);
	}]);

//....................................................................................
//CONTROLLER - ctrl_search
	app.controller("ctrl_search",['svc_map', function(svc_map){
		var ctrl = this;
		
		var _geocoder = new google.maps.Geocoder();
		
		ctrl.geocode = function(_search_value){
			_geocoder.geocode( { 'address': _search_value }, function(results, _status) {
			  if (_status == google.maps.GeocoderStatus.OK) {
				svc_map.map.setCenter(results[0].geometry.location);
				svc_map.map.fitBounds(results[0].geometry.viewport); 
				
				var marker = new google.maps.Marker({
					map: svc_map.map, 
					position: results[0].geometry.location,
					title: _search_value
				});	
			  }
			});
		}
		
	}]);

//....................................................................................
//CONTROLLER - ctrl_layers
	app.controller("ctrl_layers",['svc_layers','svc_legend','$scope','$timeout', 
	function(svc_layers,svc_legend,$scope,$timeout){
		var ctrl = this;
		
		//Get layers on app-load?
			if ($scope.getlayersonload == "true"){
				svc_layers.get_layers(function(){
					ctrl.layers = svc_layers.layers;
					ctrl.groups = svc_layers.groups;
					
					//Turn on any layers where openonload=true
					svc_layers.layers.filter(function(lyr){
						return lyr.openonload == true || lyr.openonload.toLowerCase() == "true";
					})
					.forEach(function(lyr){
						lyr.toggle();
					});
				});
			}else{
				ctrl.layers = svc_layers.layers;
				ctrl.groups = svc_layers.groups;
			}
			
		//Legend?
			ctrl.legendbuttons = $scope.legendbuttons;
			
			ctrl.legend = {
				show: function(_layer){
					//Open the legend-panel
						$(".container-map").removeClass("col-md-10").addClass("col-md-8");
						$("#panel_legend").removeClass("hidden");
					
					//Is layer active?
						if(_layer.active == false){
							
							var stop = $scope.$watch(function(){return _layer.isloading;},function(_new,_old){
								console.log("watch")
								console.log(_new + " " + _old)
								if (_old==true && _new == false){
									//Copy the legend for this layer to svc_legend.items
									angular.copy(_layer.mapService.layers[0].legend, svc_legend.items);
									stop();
								}
							})
							
							_layer.toggle();
						}
					
					
				}
			}
	}]);

	
//....................................................................................
//DIRECTIVE - layer list
	app.directive('layerList', ['svc_layers',function(svc_layers) {
		return {
			restrict: 'E',			
			scope: {getlayersonload: "@getlayersonload", legendbuttons: "@legendbuttons"},			
			controller: "ctrl_layers",
			controllerAs: 'vm',			
			template: [ 
				'<div class="panel-group" id="accordion" style="font-size: 0.8em;">',
				
					'<div class="panel panel-default" ng-repeat="group in vm.groups | orderBy: \'order\' ">',
				  
						'<!--Title: Group Name-->',
						'<div class="panel-heading" role="tab" id="headingOne" data-toggle="collapse" data-parent="#accordion" href="#{{group.id}}">',
							'<h4 class="panel-title">',
								'<a class="accordion-toggle" role="button" data-toggle="collapse" data-parent="#accordion" href="#{{group.id}}">',
								'{{group.name}}',
								'</a>',
							'</h4>',
						'</div>',
						
						'<!--Body: Layer Buttons-->',
						'<div id="{{group.id}}" class="panel-collapse collapse" ng-class="{\'in\': $index==0}"> <!--First group is opened by default-->',
							'<div class="panel-body">',
								'<div class="btn-group-vertical container-layer-buttons-group" role="group">',
									'<table class="table">',
										'<tr ng-repeat="lyr in vm.layers | filter: {\'groupid\': group.id}">',
											'<td ng-click="lyr.toggle()">',
												'<span ng-if="lyr.active==false" class="glyphicon glyphicon-plus" style="color:gainsboro; font-size:1em;"></span>',
												'<span ng-if="lyr.active==true" class="glyphicon glyphicon-ok" style="color:green; font-size:1.2em;"></span>',
												' <a href="" class="accordion-layer-label" ng-class="{\'bold\': lyr.active==true}">{{lyr.label}}</a>',
											'</td>',
											'<td>',
												'<span ng-if="lyr.isloading==true" class="glyphicon glyphicon-refresh gly-spin" aria-hidden="true" title="Loading from server"></span>',
											'</td>',
											'<td>',
												'<span ng-if="lyr.refreshinterval && lyr.active==false" class="glyphicon glyphicon-time layer-button-autorefresh-symbol" aria-hidden="true" title="Layer will auto-refresh"></span>',
												'<span ng-if="lyr.refreshinterval && lyr.active==true" class="glyphicon glyphicon-time layer-button-autorefresh-symbol gly-spin" aria-hidden="true" title="Layer will auto-refresh"></span>',
											'</td>',
											'<td>',
												'<span ng-if="(lyr.legendshow == true || lyr.legendshow.toLowerCase() == \'true\') && vm.legendbuttons==\'true\'" class="glyphicon glyphicon-menu-hamburger" ng-click="vm.legend.show(lyr);"></span>',
											'</td>',
										'</tr>',
									'</table>',
								'</div>',
							'</div>',
						'</div>	', 
					'</div>',
				'</div>'
			].join('')
		}
	}]);

	
//....................................................................................
//DIRECTIVE - legend
	app.directive('layerLegend', function(svc_legend) {
		return {
			restrict: 'E',	
			link: function(scope, elem, attr) {
				//Uses svc_legend. .items are set by ctrl_layers
				scope.items = svc_legend.items;
			},	
			controller: function(){
				this.hide = function(){
					$(".container-map").removeClass("col-md-8").addClass("col-md-10");	
					//$("#panel_layers").removeClass("col-md-2").addClass("col-md-3");						
					$("#panel_legend").addClass("hidden");
				}
			},
			controllerAs: "vm",
			template: [ 
				'<nav class="navbar navbar-default ">',
					'<div class="container-fluid">',
						'<div class="navbar-header">',
							'<a class="navbar-brand" href="">Legend</a>',
						'</div>',
						'<ul class="nav navbar-nav navbar-right">',
							'<li><button class="btn btn-xs btn-default navbar-btn" ng-click="vm.hide()"><span class="glyphicon glyphicon-remove"></span></button></li>',
						'</ul>',
					'</div>',
				'</nav>',
				
				'<div>',
					'<table class="table">',
						'<thead>',
							'<tr>',
								'<th>Symbol</th>',
								'<th>Value</th>',
							'</tr>',
						'</thead>',
						'<tbody>',
							'<tr ng-repeat="itm in items">',
								'<td><img ng-src="data:{{itm.contentType}};base64,{{itm.imageData}}" ng-height="itm.height" ng-width="itm.width"/></td>',
								'<td>{{itm.values[0]}}</td>',
							'</tr>',
						'</tbody>',
					'</table>',
				'</div>'
			].join('')
		}
	});
	