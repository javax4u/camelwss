package com.myown.app.camelwss.route;

import java.util.Random;

import org.apache.camel.Exchange;
import org.apache.camel.LoggingLevel;
import org.apache.camel.Processor;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import org.joda.time.DateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ChartWSRoute extends RouteBuilder {
	
	static Logger logger = LoggerFactory.getLogger(ChartWSRoute.class);
	
	private final String CONNECTION_URI = "//localhost:9292/chart"; 

	@Override
	public void configure() throws Exception {
		
		
		
		
		from("websocket:"+CONNECTION_URI+"?enableJmx=false")
		.routeId("chartRoute")
        .log(LoggingLevel.DEBUG,">> msg recieved : ${body}")
        .unmarshal().json(JsonLibrary.Jackson, Info.class)
        .process(new Processor() {
			
			@Override
			public void process(Exchange exchange) throws Exception {
				Info info = exchange.getIn().getBody(Info.class);
				
				if( "cmd".equals(info.getHeader()))
				{
					if( "start".equals(info.getMsg()))
						exchange.getContext().startRoute("timerRoute");
					if( "stop".equals(info.getMsg()))
						exchange.getContext().stopRoute("timerRoute");
				}
				
				
				logger.info("data from client: " + info);
				DateTime nuh = new DateTime();
				String msg = "pong: " + nuh.toString("HH:mm:ss");
				Info response = new Info();
				response.setHeader("ping");
				response.setMsg(msg);
				exchange.getIn().setBody(response, Info.class);
				
			}
		})
		.marshal().json(JsonLibrary.Jackson, Info.class)
		.to("direct:chartUt");
		
		
		
		from("timer://myTimer?fixedRate=true&period=100")
		.routeId("timerRoute")
		.noAutoStartup()
		.process(new Processor() {
			
			Random randomGenerator = new Random();
			
			@Override
			public void process(Exchange exchange) throws Exception {
							
				Info response = new Info();
				response.setHeader("msg");
				String s = String.valueOf(randomGenerator.nextInt(20) + 1);
				response.setMsg( s );
				exchange.getIn().setBody(response, Info.class);
				
			}
		})
		.marshal().json(JsonLibrary.Jackson, Info.class)
		.to("direct:chartUt");
		
		
		
		from("direct:chartUt")
		.log(LoggingLevel.DEBUG,">> msg response : ${body}")
        .to("websocket:"+CONNECTION_URI+"?sendToAll=true&enableJmx=false");

	}

}
