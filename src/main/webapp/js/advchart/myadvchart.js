require([ 
	  "dojox/charting/Chart", 
	  "dojox/charting/themes/Claro",
	  "dojo/store/Observable", 
	  "dojo/store/Memory",
	  "dojox/charting/StoreSeries", 
	  "dojo/dom",
	  "dojox/socket",
	  "dojo/json",
	  "dojo/_base/fx",
	
	  "dojox/charting/plot2d/Lines",
	  "dojox/charting/axis2d/Default", 
	  "dojo/domReady!" 
	], function(Chart, Claro, Observable, Memory, StoreSeries, dom, dojoxSocket, json, fx ) {
	
	    
	dojo.style("h2", "opacity", "0");
	
	
	var connectionUrl = "ws://localhost:9292/advchart";
	var socket = dojoxSocket(connectionUrl);
	//	socket = socketReconnect(socket);  // funker ikke med custom build prosessen

	var start = false;
	
	
	
	socket.on("message", function(event) {
		if( event.error)
		{
			myLog("message: oppstod feil.. " + event.error);
		}
		else
		{
			var resInfo = json.parse(event.data);
			if( resInfo.header == 'msg')
			{
				addToChart(resInfo.content);
			}
			else if( resInfo.header == 'heartbeat' )
			{
				var info = { "header":"heartbeat" ,
						"sender":"client",
						"senderTimestamp":resInfo.senderTimestamp,
						"content":new Date().getTime() };
				sendToServer( info );
//				myLog( "heartbeat recieved" );
				
				var target = dom.byId("h2");
				dojo.style("h2", "opacity", "1");
			    fx.fadeOut({ node: target, duration: 2000 }).play();
			}
		}				
	});

	socket.on("open", function(event) {
		var info = { "header":"msg" , "content":"hi server" };
		sendToServer(info);
	});

	var errorHappened = false;
	socket.on( "error",  function(e) {
		//myLog("error.. " + e); //
		//myLog("error.. " + event.error); // not all errors have an error
		//myLog("error.. " + event.type); // this just say "error"
		myLog("some error happended");
		start = false;	// to avoid looping error on reconnect
		errorHappened = true;
	});

	socket.on("close", function(event){
		myLog('disconnected');
//		myLog( event.type); //close
		myLog( event.reason ); // ??
		myLog( 'start: ' + start );
		myLog( "readystate: " + socket.readyState ); // 
		
		// my reconnect strategy.
		if( start && socket.readyState == 3 && !errorHappened){
			myLog( "reconnecting?" ); // 
			dojoxSocket.replace(socket, dojoxSocket(connectionUrl), true);
		}
		else
		{
			socket.close();
		}
		
	});

	
	addStartClick = function() 
    { 
		var info = { "header":"cmd" , "content":"start" };
        dom.byId("startButton").onclick = function(evt) { 
        	sendToServer(info); 
        	start = true;
        };
    };
    addStopClick = function() 
    { 
		var info = { "header":"cmd" , "content":"stop" };
        dom.byId("stopButton").onclick = function(evt) { 
        	sendToServer(info); 
        	start = false;
        };
    };
    addStartClick();
    addStopClick();
    
   
    function sendToServer( object ) {    	
		return socket.send(json.stringify(object));
    }
	

	
    function myLog( str )
    {
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
			{ id: 5, value: 26 }			
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

		
		// Simulate a data chage from a store or service
//		var startNumber = data.length;
//		var interval = setInterval(function() {
//			// Notify the store of a data change
//			store.notify({
//				value : Math.ceil(Math.random() * 29),
//				id : ++startNumber,
//				site : 1
//			});
//			// Stop at 50
//			if (startNumber == 120)
//				clearInterval(interval);
//		}, 1000);
		
		var startNumber = data.length;
		function addToChart( value )
		{
			var newid = ++startNumber;
			
			store.notify({
				value : Number(value),
				id : newid
			});
			if (startNumber > 25)
			{
				var newx = ++minXaxis;
				var newy = ++maxXaxis;
				
//				store.remove( startNumber - 26 ); // funker ikke...
//				store.notify();
				
				// re-add axis to make it move...
				chart.addAxis("x", {
					microTickStep : 1,
					minorTickStep : 1,
					min : newx,
					max : newy
				});
			
				chart.render();
				
//				myLog("addToChart newid: " + startNumber + " x: " + minXaxis + " y: " + maxXaxis);
//				chart.zoomIn("x",[newx, newy ]);
			}
				
		}

});