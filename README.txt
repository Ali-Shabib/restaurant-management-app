Name: Syed Ali Shabib

Files:

- server.js                  : Node.js HTTP server (no Express)
- templates/stats.pug        : Pug template for the stats page
- client/order.html          : order form page (HTML)
- client/client.js           : client code (fetch, render menu, cart, submit)
- client/style.css           : basic styles
- client/img/add.png         : add icon
- client/img/remove.png      : remove icon
- restaurants/aragorn.json   : restaurant data
- restaurants/legolas.json   : restaurant data
- restaurants/frodo.json     : restaurant data

Design Choices: 

- Same header on all pages: Home | Order Form | Restaurant Stats
- All restaurant data comes from the server (JSON). No hardcoding on the client.
- Order form shows categories, items, prices, and an order summary panel.
- Submit button is disabled until subtotal ≥ minimum order.
- Stats page is rendered on the server with Pug (as required).

Instructions:

1) Install the template engine:
   npm install pug

2) Start the server:
   node server.js

3) Open in a browser:
   http://localhost:2406/          (Home)
   http://localhost:2406/order.html (Order Form)
   http://localhost:2406/stats      (Statistics)
