require([ 
	  "dojo/dom",
	  "dojox/socket",
	  "dojo/json",
	  "dojo/_base/fx",
	  "dojo/domReady!" 
	], function( dom, dojoxSocket, json, fx ) {
	

	//
	dojo.style("heartImg", "opacity", "0");
	
	var connectionUrl = "ws://localhost:9292/heartbeat";
	var socket = dojoxSocket(connectionUrl);

	var start = false;
	var reconnect = false;
	
	socket.on("message", function(event) {
		if( event.error)
		{
			errorHandler(event);
		}
		else
		{
			var resInfo = json.parse(event.data);
			if( resInfo.header == 'heartbeat' )
			{
				var info = { "header":"heartbeat" ,
						"sender":"client",
						"senderTimestamp":resInfo.senderTimestamp,
						"content":new Date().getTime() };
				sendToServer( info );
				
				var target = dom.byId("heartImg");
				dojo.style("heartImg", "opacity", "1");
			    fx.fadeOut({ node: target, duration: 2000 }).play();
			}
		}				
	});

	socket.on("open", function(event) {
		var info = { "header":"msg" , "content":"hi server" };
		sendToServer(info);
	});

	var errorHappened = false;
	socket.on( "error",  function(event) {
		errorHandler(event);
	});

	socket.on("close", function(event){
		myLog('disconnected');
		myLog( event.reason ); // ??
		myLog( 'heartbeat started: ' + start );
		myLog( 'reconnect enabled: ' + reconnect );
		myLog( "readystate: " + socket.readyState ); // 
		
		// my reconnect strategy.
		if( reconnect && socket.readyState == 3 && !errorHappened){
			myLog( "reconnecting?" ); // 
			dojoxSocket.replace(socket, dojoxSocket(connectionUrl), true);
		}
		else
		{
			socket.close();
		}
		
	});
	
	function errorHandler(event)
	{
		//myLog("error.. " + event.error); // not all errors have an error
		myLog("some crazy error happended");
		start = false;	// to avoid looping error on reconnect
		reconnect = false; // to avoid looping error on reconnect
		errorHappened = true;
	}

		
	addStartHeartClick = function() 
    { 
		var info = { "header":"cmd" , "content":"start" };
        dom.byId("startHeartButton").onclick = function(evt) { 
        	sendToServer(info); 
        	start = true;
        };
    };
    addStopHeartClick = function() 
    { 
		var info = { "header":"cmd" , "content":"stop" };
        dom.byId("stopHeartButton").onclick = function(evt) { 
        	sendToServer(info); 
        	start = false;
        };
    };
    
    
    
    
    disableReconnect(); // to set the enable button
    
    function enableReconnect()
    {
    	var button = dom.byId("enableReconnectButton");
    	button.onclick = function() {
    		disableReconnect();
    	};
    	button.value = 'Disable!';
    	reconnect = true;
    	dom.byId("reconnectMsg").innerHTML = 'Reconnect is Enabled!';
    	myLog( 'reconnect enabled: ' + reconnect );
    }
    
    function disableReconnect()
    {
    	var button = dom.byId("enableReconnectButton");
    	button.onclick = function() {
    		enableReconnect();
    	};
    	button.value = 'Enable!';
    	reconnect = false;
    	dom.byId("reconnectMsg").innerHTML = 'Reconnect is Disabled!';
    	myLog( 'reconnect enabled: ' + reconnect );
    }
    
  
    addStartHeartClick();
    addStopHeartClick();
    
   
    function sendToServer( object ) {    	
		return socket.send(json.stringify(object));
    }
	

	
    function myLog( str )
    {
    	elem = dom.byId("log_div");
		elem.innerHTML = elem.innerHTML +  str + '<br>';
    };
	
		
});