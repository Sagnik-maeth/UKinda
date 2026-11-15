import { createServer } from "node:http";

const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("realtime up");
});

server.listen(4000, () => {
  console.log("realtime on :4000");
});
