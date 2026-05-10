const path = require("path");

let escpos = null;
let USB = null;

// Dynamically load escpos modules (optional dependency)
try {
  escpos = require("escpos");
  USB = require("escpos-usb");
} catch (err) {
  console.log("[Printer] escpos/escpos-usb not installed. Thermal printing disabled.");
}

function findPrinter() {
  if (!escpos || !USB) return null;
  try {
    const devices = USB.findPrinter();
    if (!devices || devices.length === 0) return null;
    const device = devices[0];
    return new escpos.USB(device.vid, device.pid);
  } catch (err) {
    console.error("[Printer] Find error:", err.message);
    return null;
  }
}

function formatReceipt(order, settings) {
  const items = order.items || [];
  const date = new Date(order.created).toLocaleString("en-IN");
  const storeName = settings?.store_name || "NEXUS BHUTAN";
  const footer = settings?.receipt_footer || "Thank you!";

  return {
    storeName,
    address: settings?.store_address || "",
    tpn: settings?.tpn_gstin || "",
    orderNo: order.order_no,
    date,
    payment: (order.payment_method || "").toUpperCase(),
    customer: order.customer_name || "",
    items: items.map((i) => ({
      name: i.name,
      qty: i.quantity,
      price: i.unit_price.toFixed(2),
      total: i.total.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    gst: order.gst_total.toFixed(2),
    total: order.grand_total.toFixed(2),
    footer,
    signature: order.digital_signature || "",
  };
}

function printReceipt(order, settings) {
  return new Promise((resolve, reject) => {
    if (!escpos || !USB) {
      reject(new Error("Printer drivers not installed. Run: npm install escpos escpos-usb usb"));
      return;
    }

    const device = findPrinter();
    if (!device) {
      reject(new Error("No USB thermal printer found"));
      return;
    }

    const printer = new escpos.Printer(device);
    const r = formatReceipt(order, settings);

    device.open((err) => {
      if (err) {
        reject(err);
        return;
      }

      printer
        .font("a")
        .align("ct")
        .style("bu")
        .size(1, 1)
        .text(r.storeName)
        .style("normal")
        .size(0, 0);

      if (r.address) printer.text(r.address);
      if (r.tpn) printer.text(`TPN: ${r.tpn}`);
      printer.text("TAX INVOICE — GST 2026");
      printer.drawLine();

      printer.align("lt");
      printer.text(`Inv: ${r.orderNo}`);
      printer.text(`Date: ${r.date}`);
      printer.text(`Pay: ${r.payment}`);
      if (r.customer) printer.text(`Cust: ${r.customer}`);
      printer.drawLine();

      r.items.forEach((item) => {
        const left = `${item.name.substring(0, 20)}`;
        const right = `${item.qty}x ${item.total}`;
        const pad = 32 - left.length - right.length;
        printer.text(left + " ".repeat(Math.max(0, pad)) + right);
      });

      printer.drawLine();
      printer.text(`Subtotal: ${" ".repeat(18)} ${r.subtotal}`);
      printer.text(`GST 5%:   ${" ".repeat(18)} ${r.gst}`);
      printer.text(`TOTAL:    ${" ".repeat(18)} ${r.total}`);
      printer.drawLine();

      if (r.signature) {
        printer.text("Signature:");
        printer.text(r.signature.substring(0, 32));
      }

      printer.align("ct");
      printer.text(r.footer);
      printer.cut();
      printer.close();

      resolve(true);
    });
  });
}

function getPrinterStatus() {
  if (!escpos || !USB) {
    return { connected: false, name: "Drivers not installed" };
  }
  const device = findPrinter();
  return {
    connected: !!device,
    name: device ? "USB Thermal Printer" : "Not found",
  };
}

function testPrint() {
  return printReceipt(
    {
      order_no: "TEST-001",
      created: new Date().toISOString(),
      payment_method: "cash",
      customer_name: "Test Customer",
      items: [{ name: "Test Product", quantity: 1, unit_price: 100, total: 105 }],
      subtotal: 100,
      gst_total: 5,
      grand_total: 105,
      digital_signature: "test-signature",
    },
    { store_name: "Test Store", receipt_footer: "Printer OK!" }
  );
}

module.exports = { printReceipt, getPrinterStatus, testPrint, findPrinter };
