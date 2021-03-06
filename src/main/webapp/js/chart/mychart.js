require([ 
	  "dojox/charting/Chart", 
	  "dojox/charting/themes/Claro",
	  "dojo/store/Observable", 
	  "dojo/store/Memory",
	  "dojox/charting/StoreSeries", 
	  "dojo/dom",
	  "dojox/socket",
	  "dojo/json",
	
	  "dojox/charting/plot2d/Lines",
	  "dojox/charting/axis2d/Default", 
	  "dojo/domReady!" 
	], function(Chart, Claro, Observable, Memory, StoreSeries, dom, dojoxSocket, json ) {

	
	var socket = dojoxSocket("ws://localhost:9292/chart");
	//	socket = socketReconnect(socket);  // funker ikke med custom build prosessen

	socket.on("message", function(event) {
		if( event.error) {
			myLog("message: oppstod feil.. " + event.error);
		}
		else {
			var resInfo = json.parse(event.data);
			if( resInfo.header == 'msg')
				addToChart(resInfo.content);
		}				
	});

	socket.on("open", function(event) {
		var info = { "header":"msg" , "content":"hi server" };
		sendToServer(info);
	});

	socket.on( "error",  function(e) {
		myLog("error.. " + e);
		myLog("error.. " + event.error);
		myLog("error.. " + event.type);
	});

	socket.on("close", function(event, args){
		myLog('disconnected');
		socket.close();
	}, false, false);

	addStartClick = function() { 
		var info = { "header":"cmd" , "content":"start" };
        dom.byId("startButton").onclick = function(evt) { 
        	sendToServer(info); 
        };
    };
    addStopClick = function() { 
		var info = { "header":"cmd" , "content":"stop" };
        dom.byId("stopButton").onclick = function(evt) { 
        	sendToServer(info); 
        };
    };
    addStartClick();
    addStopClick();
    
   
    function sendToServer( object ) {    	
		return socket.send(json.stringify(object));
    }
	

	
    function myLog( str ) {
    	elem = dom.byId("my_div");
		elem.innerHTML = elem.innerHTML +  str + '<br>';
    };
	
	
	// Initial data
	var data = [
		// This information, presumably, would come from a database or web service
		{ id: 1, value: 20 },
		{ id: 2, value: 16 },
		{ id: 3, value: 11 },
		{ id: 4, value: 18 },
		{ id: 5, value: 3 }			
	];

	// Create the data store
	// Store information in a data store on the client side
	var store = Observable(new Memory({
		data : {
			identifier : "id",
			label : "Some Datapoints",
			items : data
		}
	}));

	// Create the chart within it's "holding" node
	// Global so users can hit it from the console
	chart = new Chart("chartNode");

	// Set the theme
	chart.setTheme(Claro);

	// Add the only/default plot 
	chart.addPlot("default", {
		type : "Lines",
		markers : true
	});

	var minXaxis = 0;
	var maxXaxis = 60;
	// Add axes
	chart.addAxis("x", {
		microTickStep : 1,
		minorTickStep : 1,
		min : minXaxis,
		max : maxXaxis
	});
	
			
	chart.addAxis("y", {
		vertical : true,
		fixLower : "major",
		fixUpper : "major",
		minorTickStep : 1
	});

	// Add the storeseries - Query for all data
	chart.addSeries("y", new StoreSeries(store, {}, "value"));

	
	// Render the chart!
	chart.render();
			
	var startNumber = data.length;
	function addToChart( value )
	{
		var newid = ++startNumber;
		
		store.notify({
			value : Number(value),
			id : newid
		});
		if (startNumber > 25) {
			var newx = ++minXaxis;
			var newy = ++maxXaxis;
			
			// re-add axis to make it move...
			chart.addAxis("x", {
				microTickStep : 1,
				minorTickStep : 1,
				min : newx,
				max : newy
			});
		
			chart.render();			
		}			
	}
});