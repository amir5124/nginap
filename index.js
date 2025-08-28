const express = require("express");
const { Router } = require("express");
const fs = require('fs');
const moment = require('moment-timezone');
const html = fs.readFileSync("template.html", "utf8");
const twilio = require("twilio");
const path = require('path');
const cors = require("cors");
const FormData = require("form-data");
const axios = require("axios");
const nodemailer = require('nodemailer');
const bodyParser = require("body-parser");
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { initializeApp } = require("firebase/app");
const {
  getDatabase,
  ref,
  set,
  get,
  update
} = require("firebase/database");

const firebaseConfig = {
  apiKey: "AIzaSyD8P9au26mC8xx8UcjNsm-NMW5JUgTHUBU",
  authDomain: "linku-3ca65.firebaseapp.com",
  databaseURL: "https://linku-3ca65-default-rtdb.firebaseio.com",
  projectId: "linku-3ca65",
  storageBucket: "linku-3ca65.appspot.com",
  messagingSenderId: "759194220603",
  appId: "1:759194220603:web:33e2327dfa94af2552841e"
};

const FIREBASE = initializeApp(firebaseConfig);
const databaseFire = getDatabase(FIREBASE);

require('dotenv').config();

const app = express();
const router = Router();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
// 🔐 Konfigurasi kredensial
const clientId = "5f5aa496-7e16-4ca1-9967-33c768dac6c7";
const clientSecret = "TM1rVhfaFm5YJxKruHo0nWMWC";
const username = "LI9019VKS";
const pin = "5m6uYAScSxQtCmU";
const serverKey = "QtwGEr997XDcmMb1Pq8S5X1N";

// 📝 Fungsi untuk menulis log ke stderr.log
function logToFile(message) {
  const logPath = path.join(__dirname, 'stderr.log');
  const timestamp = new Date().toISOString();
  const fullMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile(logPath, fullMessage, (err) => {
    if (err) {
      console.error("❌ Gagal menulis log:", err);
    }
  });
}

// 🔄 Fungsi expired format YYYYMMDDHHmmss
function getExpiredTimestamp(minutesFromNow = 15) {
  return moment.tz('Asia/Jakarta').add(minutesFromNow, 'minutes').format('YYYYMMDDHHmmss');
}

const getFormatNow = () => {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

// 🔐 Fungsi membuat signature untuk request POST VA
function generateSignaturePOST({
  amount,
  expired,
  bank_code,
  partner_reff,
  customer_id,
  customer_name,
  customer_email,
  clientId,
  serverKey
}) {
  const path = '/transaction/create/va';
  const method = 'POST';

  const rawValue = amount + expired + bank_code + partner_reff +
    customer_id + customer_name + customer_email + clientId;
  const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();

  const signToString = path + method + cleaned;

  return crypto.createHmac("sha256", serverKey).update(signToString).digest("hex");
}

function generateSignatureQRIS({
  amount,
  expired,
  partner_reff,
  customer_id,
  customer_name,
  customer_email,
  clientId,
  serverKey
}) {
  const path = '/transaction/create/qris';
  const method = 'POST';

  const rawValue = amount + expired + partner_reff +
    customer_id + customer_name + customer_email + clientId;
  const cleaned = rawValue.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();

  const signToString = path + method + cleaned;

  return crypto.createHmac("sha256", serverKey).update(signToString).digest("hex");
}

// 🧾 Fungsi membuat kode unik partner_reff
function generatePartnerReff() {
  const prefix = 'INV-782372373627';
  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${timestamp}-${randomStr}`;
}

// ✅ Endpoint POST untuk membuat VA
app.post('/create-va', async (req, res) => {
  try {
    const body = req.body;
    const partner_reff = generatePartnerReff();
    const expired = getExpiredTimestamp();
    const url_callback = "https://hotel.siappgo.id/callback";
    const user = body.nama;

    const signature = generateSignaturePOST({
      amount: body.amount,
      expired,
      bank_code: body.bank_code,
      partner_reff,
      customer_id: body.customer_id,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      clientId,
      serverKey
    });

    const payload = {
      ...body,
      partner_reff,
      username,
      pin,
      expired,
      signature,
      url_callback
    };

    const headers = {
      'client-id': clientId,
      'client-secret': clientSecret
    };

    const url = 'https://api.linkqu.id/linkqu-partner/transaction/create/va';
    const response = await axios.post(url, payload, { headers });
    const result = response.data;

    // 🔹 Data untuk Firebase
    const insertData = {
      partner_reff,
      customer_id: body.customer_id,
      customer_name: body.customer_name,
      amount: body.amount,
      bank_code: result?.bank_name || body.bank_code || null,
      expired,
      customer_phone: body.customer_phone || null,
      customer_email: body.customer_email,
      va_number: result?.virtual_account || null,
      response_raw: result,
      created_at: new Date().toISOString(),
      status: "PENDING",

      // 🔹 Tambahkan field tambahan dari frontend
      nama: body.nama,
      title: body.title,
      invoice: body.invoice,
      tanggal: body.tanggal,
      tanggalcheckin: body.tanggalcheckin,
      tanggalcheckout: body.tanggalcheckout,
      jumlahkamar: body.jumlahkamar,
      jumlahdewasa: body.jumlahdewasa,
      jumlahanak: body.jumlahanak,
      jumlahmalam: body.jumlahmalam,
      tamu: body.tamu,
      namakamar: body.namakamar,
      catatan: body.catatan,
      merchant: body.merchant,
    };

    // 💾 Simpan ke Firebase Realtime Database
    await set(ref(databaseFire, `inquiry_va_hotel/${partner_reff}`), insertData);

    res.json(result);
  } catch (err) {
    console.error('❌ Gagal membuat VA:', err.message);
    res.status(500).json({
      error: "Gagal membuat VA",
      detail: err.response?.data || err.message
    });
  }
});


// ✅ Endpoint POST untuk membuat QRIS
app.post('/create-qris', async (req, res) => {
  try {
    const body = req.body;
    const partner_reff = generatePartnerReff();
    const expired = getExpiredTimestamp();
    const url_callback = "https://hotel.siappgo.id/callback";
    const user = body.nama;

    const signature = generateSignatureQRIS({
      amount: body.amount,
      expired,
      partner_reff,
      customer_id: body.customer_id,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      clientId,
      serverKey
    });

    const payload = {
      ...body,
      partner_reff,
      username,
      pin,
      expired,
      signature,
      url_callback
    };

    const headers = {
      'client-id': clientId,
      'client-secret': clientSecret
    };

    const url = 'https://api.linkqu.id/linkqu-partner/transaction/create/qris';
    const response = await axios.post(url, payload, { headers });

    const result = response.data;

    let qrisImageBuffer = null;
    if (result?.imageqris) {
      try {
        const imgResp = await axios.get(result.imageqris.trim(), { responseType: 'arraybuffer' });
        qrisImageBuffer = Buffer.from(imgResp.data).toString('base64'); // simpan base64 ke Firebase
      } catch (err) {
        console.error("⚠️ Failed to download QRIS image:", err.message);
      }
    }

    const insertData = {
      partner_reff,
      customer_id: body.customer_id,
      customer_name: body.customer_name,
      amount: body.amount,
      bank_code: result?.bank_name || body.bank_code || null,
      expired,
      customer_phone: body.customer_phone || null,
      customer_email: body.customer_email,
      va_number: result?.virtual_account || null,
      response_raw: result,
      created_at: new Date().toISOString(),
      status: "PENDING",

      // 🔹 Tambahkan field tambahan dari frontend
      nama: body.nama,
      title: body.title,
      invoice: body.invoice,
      tanggal: body.tanggal,
      tanggalcheckin: body.tanggalcheckin,
      tanggalcheckout: body.tanggalcheckout,
      jumlahkamar: body.jumlahkamar,
      jumlahdewasa: body.jumlahdewasa,
      jumlahanak: body.jumlahanak,
      jumlahmalam: body.jumlahmalam,
      tamu: body.tamu,
      namakamar: body.namakamar,
      catatan: body.catatan,
      merchant: body.merchant,
    };

    // 💾 Simpan ke Firebase Realtime Database
    await set(ref(databaseFire, `inquiry_qris_hotel/${partner_reff}`), insertData);

    res.json(result);

  } catch (err) {
    console.error(`❌ Gagal membuat QRIS: ${err.message}`);
    res.status(500).json({
      error: "Gagal membuat QRIS",
      detail: err.response?.data || err.message
    });
  }
});


app.get('/download-qr/:partner_reff', async (req, res) => {
  const partner_reff = req.params.partner_reff;

  try {
    // 🔹 Ambil data QRIS dari Firebase
    const dbRef = ref(databaseFire, `inquiry_qris_hotel/${partner_reff}`);
    const snapshot = await get(dbRef);

    if (!snapshot.exists()) {
      return res.status(404).send('QRIS tidak ditemukan di database.');
    }

    const data = snapshot.val();

    // 1️⃣ Kalau sudah ada gambar base64, kirim langsung
    if (data.qris_image_base64) {
      console.log(`✅ QR ditemukan di Firebase (base64): ${partner_reff}`);
      const imgBuffer = Buffer.from(data.qris_image_base64, 'base64');
      res.setHeader('Content-Disposition', `attachment; filename="qris-${partner_reff}.png"`);
      res.setHeader('Content-Type', 'image/png');
      return res.send(imgBuffer);
    }

    // 2️⃣ Kalau belum ada base64 tapi ada URL, download dari URL
    if (data.qris_url) {
      console.log(`🔗 Download QR dari URL: ${data.qris_url}`);
      const response = await axios.get(data.qris_url.trim(), { responseType: 'arraybuffer' });
      const imgBuffer = Buffer.from(response.data);

      // Simpan base64-nya ke Firebase supaya nanti tidak perlu download ulang
      const base64Str = imgBuffer.toString('base64');
      await set(ref(databaseFire, `inquiry_qris_hotel/${partner_reff}/qris_image_base64`), base64Str);

      res.setHeader('Content-Disposition', `attachment; filename="qris-${partner_reff}.png"`);
      res.setHeader('Content-Type', 'image/png');
      return res.send(imgBuffer);
    }

    // Kalau tidak ada keduanya
    return res.status(404).send('QRIS tidak memiliki data gambar.');

  } catch (err) {
    console.error(`❌ Error download QR: ${err.message}`);
    res.status(500).send('Terjadi kesalahan server.');
  }
});

function formatToWhatsAppNumber(localNumber) {
  if (typeof localNumber !== 'string') {
    return null; // Pastikan input berupa string
  }

  const cleanNumber = localNumber.replace(/\D/g, ''); // Hapus karakter non-digit
  if (cleanNumber.startsWith('0')) {
    return `+62${cleanNumber.slice(1)}`;
  }
  if (cleanNumber.startsWith('62')) {
    return `+${cleanNumber}`;
  }
  if (cleanNumber.startsWith('+62')) {
    return `${cleanNumber}`;
  }
  return null; // Nomor tidak valid
}


async function sendWhatsAppMessage(to, variables) {
  try {
    const from = "whatsapp:+62882005447472"; // Nomor WhatsApp bisnis
    const response = await client.messages.create({
      from,
      to: `whatsapp:${to}`,
      contentSid: "HXebc8155c0e6bdcfd92f6513e304cfc4e", // Template SID
      contentVariables: JSON.stringify(variables),
    });
    console.log("✅ Pesan WhatsApp terkirim:", response.sid);
    return { status: true, message: "Pesan berhasil dikirim." };
  } catch (error) {
    console.error("❌ Gagal mengirim pesan WhatsApp:", error.message);
    return { status: false, message: error.message };
  }
}


// Fungsi menambahkan saldo dan mengirim WhatsApp
async function addBalance(partner_reff, va_code, serialnumber) {
  try {
    // Tentukan path di Firebase (QRIS atau VA)
    const path = va_code === "QRIS"
      ? `inquiry_qris_hotel/${partner_reff}`
      : `inquiry_va_hotel/${partner_reff}`;

    // Ambil data dari Firebase
    const snap = await get(ref(databaseFire, path));
    if (!snap.exists()) throw new Error(`Data ${partner_reff} tidak ditemukan di ${path}`);

    const data = snap.val();
    const originalAmount = parseInt(data.amount);

    // Nomor WhatsApp customer
    // const recipientWhatsApp = formatToWhatsAppNumber(data.customer_phone);

    // // Variabel template pesan WhatsApp
    // const variables = {
    //   "1": String(data.customer_name || "Tidak tersedia"),
    //   "2": String(data.partner_reff || "Tidak tersedia"),
    //   "3": `Rp${originalAmount.toLocaleString("id-ID")}`,
    //   "4": String(va_code),
    //   "5": String(serialnumber),

    //   // tambahan dari body
    //   "6": String(data.date || "2025-08-11"),
    //   "7": String(data.name || "Tidak tersedia"),
    //   "8": String(data.note || "tidak ada"),
    //   "9": String(data.pax || "1"),
    // };

    // // Kirim WhatsApp ke customer
    // await sendWhatsAppMessage(recipientWhatsApp, variables);

    // Catatan transaksi
    const formattedAmount = originalAmount.toLocaleString("id-ID");
    const catatan = `Transaksi ${va_code} sukses || Nominal Rp${formattedAmount} || Biller Reff ${serialnumber} || Tanggal ${data.date || "2025-08-11"} || Nama ${data.name || "-"} || Note ${data.note || ""} || Pax ${data.pax || "1"}`;
    const username = data.merchant;

    // Request ke API untuk update saldo
    const formdata = new FormData();
    formdata.append("amount", originalAmount);
    formdata.append("username", username);
    formdata.append("note", catatan);

    const config = {
      method: "post",
      url: "https://linku.co.id/qris.php",
      headers: {
        ...formdata.getHeaders(),
      },
      data: formdata,
    };

    const response = await axios(config);
    console.log("✅ Saldo berhasil ditambahkan:", response.data);

    return {
      status: true,
      message: "Saldo berhasil ditambahkan & WA terkirim",
      data: { ...data, catatan },
      balanceResult: response.data,
    };

  } catch (error) {
    console.error("❌ Gagal menambahkan saldo:", error.message);
    throw new Error("Gagal menambahkan saldo: " + error.message);
  }
}

// Route callback
app.post("/callback", async (req, res) => {
  try {
    const { partner_reff, va_code, serialnumber } = req.body;

    console.log(`✅ Callback diterima: ${JSON.stringify(req.body)}`);

    // Cek status transaksi sebelumnya
    let currentStatus;
    if (va_code === "QRIS") {
      currentStatus = await getCurrentStatusQris(partner_reff);
    } else {
      currentStatus = await getCurrentStatusVa(partner_reff);
    }

    if (currentStatus === "SUKSES") {
      console.log(`ℹ️ Transaksi ${partner_reff} sudah diproses sebelumnya.`);
      return res.json({
        message: "Transaksi sudah SUKSES sebelumnya. Tidak diproses ulang."
      });
    }

    // Tambah saldo
    await addBalance(partner_reff, va_code, serialnumber);

    // Update status transaksi di database
    if (va_code === "QRIS") {
      await updateInquiryStatusQris(partner_reff);
    } else {
      await updateInquiryStatus(partner_reff);
    }

    res.json({ message: "Callback diterima dan saldo ditambahkan" });

  } catch (err) {
    console.error(`❌ Gagal memproses callback: ${err.message}`);
    res.status(500).json({
      error: "Gagal memproses callback",
      detail: err.message
    });
  }
});

// ✅ Ambil status inquiry_va_hotel dari Firebase
async function getCurrentStatusVa(partnerReff) {
  try {
    const snap = await get(ref(databaseFire, `inquiry_va_hotel/${partnerReff}/status`));
    return snap.exists() ? snap.val() : null;
  } catch (error) {
    console.error(`❌ Gagal cek status inquiry_va_hotel: ${error.message}`);
    throw error;
  }
}

// ✅ Update status inquiry_va_hotel di Firebase
async function updateInquiryStatus(partnerReff) {
  try {
    await update(ref(databaseFire, `inquiry_va_hotel/${partnerReff}`), { status: "SUKSES" });
    console.log(`✅ Status inquiry_va_hotel untuk ${partnerReff} berhasil diubah menjadi SUKSES`);
  } catch (error) {
    console.error(`❌ Gagal update status inquiry_va_hotel: ${error.message}`);
    throw error;
  }
}

// ✅ Ambil status inquiry_qris_hotel dari Firebase
async function getCurrentStatusQris(partnerReff) {
  try {
    const snap = await get(ref(databaseFire, `inquiry_qris_hotel/${partnerReff}/status`));
    return snap.exists() ? snap.val() : null;
  } catch (error) {
    console.error(`❌ Gagal cek status inquiry_qris_hotel: ${error.message}`);
    throw error;
  }
}

// ✅ Update status inquiry_qris_hotel di Firebase
async function updateInquiryStatusQris(partnerReff) {
  try {
    await update(ref(databaseFire, `inquiry_qris_hotel/${partnerReff}`), { status: "SUKSES" });
    console.log(`✅ Status inquiry_qris_hotel untuk ${partnerReff} berhasil diubah menjadi SUKSES`);
  } catch (error) {
    console.error(`❌ Gagal update status inquiry_qris_hotel: ${error.message}`);
    throw error;
  }
}



router.use("/carter", (req, res,) => {
  const title = req.body.title;
  const type = req.body.type;
  const amount = req.body.amount;
  const step = req.body.step;
  const sender_name = req.body.sender_name;
  const sender_email = req.body.sender_email;
  const redirect_url = req.body.redirect_url;
  const payload = `title=${title}&type=${type}&amount=${amount}&step=${step}&sender_name=${sender_name}&sender_email=${sender_email}&redirect_url=${redirect_url}`;

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(secretKey).toString("base64")}`,
    },
  };

  axios
    .post(urls, payload, options)
    .then((response) => {
      console.log(response.data, res);
      res.json(response.data);
    })
    .catch((error) => {
      console.log(error, res);
      res.json(error);
    });
});






// async function addBalance(dataJson, topup) {
//   try {
//     // Pastikan properti uid ada dalam objek topup
//     if (topup) {
//       const originalAmount = dataJson.amount;
//       const tenPercent = originalAmount * 0.1;
//       const negativeAmount = originalAmount - parseInt(15000);
//       const username = topup.username;
//       const catatan = topup.catatan;

//       const formdata = new FormData();
//       formdata.append("amount", negativeAmount);
//       formdata.append("username", username);
//       formdata.append("note", catatan);

//       const config = {
//         method: 'post',
//         url: 'https://linku.co.id/qris.php',
//         headers: {
//           ...formdata.getHeaders() // Mengambil header dari FormData
//         },
//         data: formdata
//       };

//       const response = await axios(config);
//       console.log(response.data);

//       return {
//         status: true,
//         message: "Hasil Jagel",
//         data: { username, negativeAmount, catatan },
//         balanceResult: response.data,
//       };
//     } else {
//       throw new Error("Properti uid tidak ditemukan dalam objek topup.");
//     }
//   } catch (error) {
//     throw new Error(error.message);
//   }
// }


async function callbackDeposit(dataJson, res) {
  const topupId = dataJson.bill_link_id;
  const topupRef = ref(databaseFire, `topup/${topupId}`);
  const topupSnapshot = await get(topupRef);
  const topup = topupSnapshot.val();

  logToFile(`Data topup: ${JSON.stringify(topup)}`);

  const status = dataJson.status; // status dari respons callback

  try {
    // Perbarui status topup di Firebase
    await set(ref(databaseFire, `topup/${topupId}/status`), status);
    logToFile(`Berhasil memperbarui status topup di Firebase dengan id ${topupId} menjadi ${status}`);

    if (status === "SUCCESSFUL") {
      const hotelUserRef = ref(databaseFire, `hotel/${topup.username}`);
      const hotelUserSnapshot = await get(hotelUserRef);
      const hotelGroup = hotelUserSnapshot.val();

      logToFile(`Data hotel untuk user ${topup.username}: ${JSON.stringify(hotelGroup)}`);

      if (hotelGroup) {
        let hotelFound = false;

        for (const hotelId in hotelGroup) {
          if (hotelFound) {
            break; // Exit loop if hotel is already found
          }

          const hotel = hotelGroup[hotelId];
          const hotelNamahotel = hotel?.namahotel ?? '';

          logToFile(`Memeriksa hotel dengan id ${hotelId}`);
          logToFile(`Nilai yang dicocokkan - topup.namakamar: '${topup.namakamar}', hotel.namahotel: '${hotelNamahotel}'`);

          if (hotelNamahotel.trim() === (topup.namakamar ?? '').trim()) {
            logToFile(`Sebelum update: ${hotelId} - namahotel: ${hotelNamahotel}, availability: ${JSON.stringify(hotel.availability)}`);

            // Update availability
            const availabilityRef = ref(databaseFire, `hotel/${topup.username}/${hotelId}/availability`);
            const availabilitySnapshot = await get(availabilityRef);
            const availability = availabilitySnapshot.val();

            const checkinDate = new Date(topup.tanggalcheckin);
            const checkoutDate = new Date(topup.tanggalcheckout);

            // Periksa ketersediaan kamar sebelum update (sampai satu hari sebelum checkout)
            const preCheckoutDate = new Date(checkoutDate);
            preCheckoutDate.setDate(preCheckoutDate.getDate() - 1);

            for (let d = new Date(checkinDate); d <= preCheckoutDate; d.setDate(d.getDate() + 1)) {
              const dateStr = d.toISOString().split('T')[0]; // Format tanggal YYYY-MM-DD
              if (availability[dateStr] === undefined) {
                throw new Error(`Tanggal ${dateStr} tidak ditemukan dalam availability untuk hotel ${hotelId}.`);
              } else if (availability[dateStr] < topup.jumlahkamar) {
                throw new Error(`Tidak cukup ketersediaan kamar untuk tanggal ${dateStr} di hotel ${hotelId}.`);
              }
            }

            // Lakukan update availability (sampai satu hari sebelum checkout)
            for (let d = new Date(checkinDate); d <= preCheckoutDate; d.setDate(d.getDate() + 1)) {
              const dateStr = d.toISOString().split('T')[0]; // Format tanggal YYYY-MM-DD
              availability[dateStr] -= topup.jumlahkamar;
            }

            await set(availabilityRef, availability);
            logToFile(`Berhasil memperbarui availability untuk hotel dengan id ${hotelId}.`);

            hotelFound = true; // Set hotelFound to true
          }
        }

        if (!hotelFound) {
          logToFile(`Hotel tidak ditemukan dengan namahotel: '${topup.namakamar}' untuk user '${topup.username}'`);
          throw new Error('Hotel tidak ditemukan dengan namahotel yang diberikan.');
        }

        // Pastikan addBalance hanya dipanggil sekali
        const balanceResult = await addBalance(dataJson, topup);
        logToFile(balanceResult);

        // Pastikan fungsi createPDFFromCallbackData dan sendEmailWithAttachment hanya dipanggil sekali
        await createPDFFromCallbackData(dataJson, topup);
        await sendEmailWithAttachment(dataJson);

        res.json({
          status: true,
          message: "Update saldo berhasil dan email dikirim",
        });
      } else {
        throw new Error(`Data hotel tidak ditemukan untuk user '${topup.username}'.`);
      }
    } else {
      logToFile("Status bukan SUCCESSFUL, tidak memanggil fungsi addBalance");
      res.json({
        status: true,
        message: "Status bukan SUCCESSFUL, tidak memanggil fungsi addBalance",
      });
    }
  } catch (error) {
    logToFile(`Gagal memperbarui data topup di Firebase: ${error.message}`);
    res.setHeader("Content-Type", "application/json");
    res.status(403).json({
      status: false,
      message: "Gagal memperbarui data topup di Firebase",
      error: error.message,
    });
  }
}






// Konfigurasi transporter Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'linkutransport@gmail.com',
    pass: 'qbckptzxgdumxtdm', // Gantilah dengan kata sandi aplikasi Anda
  },
  tls: {
    rejectUnauthorized: true,
  },
});


// Fungsi untuk mencetak log ke stderr.log
function logToFile(message) {
  fs.appendFileSync('stderr.log', message + '\n');
}

const invoiceTemplatePath = path.join(__dirname, 'template.html');
const invoiceTemplate = fs.readFileSync(invoiceTemplatePath, 'utf8');

// Fungsi untuk membuat PDF dari string HTML
async function generatePDF(htmlContent) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  await page.setContent(htmlContent, {
    waitUntil: 'networkidle0'
  });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: {
      top: '10mm',
      bottom: '10mm',
      left: '10mm',
      right: '10mm'
    }
  });

  await browser.close();
  return pdfBuffer;
}

// Fungsi utama yang menggabungkan pembuatan PDF dan pengiriman email
async function sendEmailWithAttachment(dataJson, topup) {
  const { sender_name, sender_email, bill_title, id, amount, created_at, status, sender_bank, sender_bank_type } = dataJson;
  const { jumlahmalam } = topup;
  const total = parseInt(jumlahmalam) * parseInt(amount);

  const primaryEmail = sender_email;
  const defaultEmail = 'bocahangon64@gmail.com';

  // Mengisi template HTML dengan data
  let renderedHtml = invoiceTemplate
    .replace(/{{sender_name}}/g, sender_name)
    .replace(/{{sender_email}}/g, sender_email)
    .replace(/{{bill_title}}/g, bill_title)
    .replace(/{{id}}/g, id)
    .replace(/{{amount}}/g, amount)
    .replace(/{{created_at}}/g, created_at)
    .replace(/{{status}}/g, status)
    .replace(/{{sender_bank}}/g, sender_bank)
    .replace(/{{sender_bank_type}}/g, sender_bank_type)
    .replace(/{{jumlahmalam}}/g, jumlahmalam)
    .replace(/{{total}}/g, total);

  let pdfBuffer;
  try {
    // 1. Buat PDF dari HTML yang sudah dirender
    pdfBuffer = await generatePDF(renderedHtml);
    const successMsg = 'PDF berhasil dibuat (menggunakan Puppeteer)';
    console.log(successMsg);
    // logToFile(successMsg); // Pastikan logToFile sudah terdefinisi
  } catch (error) {
    const errorMsg = `Gagal membuat PDF: ${error}`;
    console.error(errorMsg);
    // logToFile(errorMsg);
    return;
  }

  // 2. Siapkan opsi email dengan PDF buffer
  const emailOptions = {
    from: 'linkutransport@gmail.com',
    to: primaryEmail,
    subject: 'Invoice Pembayaran',
    text: 'Terlampir adalah file PDF invoice pembayaran Anda.',
    attachments: [
      {
        filename: 'invoice.pdf',
        content: pdfBuffer,
      },
    ],
  };

  try {
    const info = await transporter.sendMail(emailOptions);
    const successMsg = `Email terkirim ke ${primaryEmail}: ${info.response}`;
    console.log(successMsg);
    // logToFile(successMsg);
  } catch (error) {
    const errorMsg = `Gagal mengirim email ke ${primaryEmail}: ${error}`;
    console.error(errorMsg);
    // logToFile(errorMsg);
    console.log(`Mengirim ulang email ke alamat default ${defaultEmail}`);

    emailOptions.to = defaultEmail;

    try {
      const info = await transporter.sendMail(emailOptions);
      const successMsg = `Email terkirim ke alamat default ${defaultEmail}: ${info.response}`;
      console.log(successMsg);
      // logToFile(successMsg);
    } catch (error) {
      const errorMsg = `Gagal mengirim email ke alamat default ${defaultEmail}: ${error}`;
      console.error(errorMsg);
      // logToFile(errorMsg);
    }
  }
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/", router);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
