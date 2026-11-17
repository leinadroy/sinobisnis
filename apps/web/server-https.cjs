// Production Next.js server with TLS on port 8443, independent of Apache/Tomcat.
process.env.NODE_ENV = "production";
process.env.COOKIE_SECURE = "1";
process.env.SINOBISNIS_PUBLIC_ORIGIN ||= "https://smlgroupid.com";

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const next = require("next");

const port = 8443;
const certDir = process.env.SINOBISNIS_TLS_DIR || "C:\\Cert\\sinobisnis-8443";
const app = next({ dev: false, dir: __dirname, hostname: "0.0.0.0", port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const server = https.createServer(
    {
      key: fs.readFileSync(path.join(certDir, "private.key")),
      cert: fs.readFileSync(path.join(certDir, "fullchain.pem")),
      minVersion: "TLSv1.2",
    },
    (req, res) => handler(req, res),
  );
  server.listen(port, "0.0.0.0", () => {
    console.log(`Sinobisnis HTTPS listening on port ${port}`);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
