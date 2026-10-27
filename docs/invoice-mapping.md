# Pemetaan Invoice PDF → Database

Pemetaan isi PDF invoice (contoh: `SML-Invoice.pdf`, invoice **26351/SML/X/2026**) ke tabel di database `sinobisnis` (MariaDB 10.4, 10.10.3.23).

Contoh data: `invoice.InvoiceId = 2334`, status `DRAFT`.

## Ringkasan relasi

```
invoice (InvoiceId)
 ├── billto          invoice.BillToId          = billto.BillToId
 ├── bankaccount     invoice.BankAccountId     = bankaccount.BankAccountId
 ├── company         invoice.InvoiceCompanyId  = company.CompanyId
 ├── sponsor         invoice.InvoiceSponsorId  = sponsor.SponsorId
 ├── invoicedetail   invoicedetail.InvoiceDetailInvoiceId = invoice.InvoiceId
 │     └── client    invoicedetail.InvoiceDetailClientNo  = client.ClientNo
 ├── invoicetax      invoicetax.InvoiceTaxInvoiceId       = invoice.InvoiceId
 │     (persentase dari tabel tax)
 └── invoiceattachment  invoiceattachment.InvoiceAttachmentInvoiceId = invoice.InvoiceId
       └── attachment   invoiceattachment.InvoiceAttachmentIdInvoice = attachment.AttachmentId
```

## Pemetaan per bagian PDF

| Bagian di PDF | Tabel | Kolom / join | Contoh nilai |
|---|---|---|---|
| Invoice Date | `invoice` | `InvoiceDate` | 2026-10-16 |
| Invoice No | `invoice` | `InvoiceNo` | 26351/SML/X/2026 |
| To (nama) | `invoice` | `InvoiceBilledTo` | Konsorsium Sinohydro-LBI |
| To (alamat 3 baris) | `billto` | `BillToAlamatBaris1`–`4` via `invoice.BillToId` | BillToId 261 |
| NPWP | `invoice` | `InvoiceNPWP` (sama dengan `billto.BillToNPWP`) | 1000000010746828 |
| Baris layanan | `invoicedetail` | baris dengan `InvoiceDetailQty > 0`: `InvoiceDetailDescription`, `InvoiceDetailQty` (Pax), `InvoiceDetailUnitPrice` (Price Per Pax), `InvoiceDetailSubTotal` (Total Price) | Business Visa … / 67 / 4,500,000 / 301,500,000 |
| Daftar nama TKA | `invoicedetail` → `client` | baris dengan `InvoiceDetailQty = 0`; teks sudah ada di `InvoiceDetailDescription` ("1. Liang Yanmin"), link ke `client.ClientNo` lewat `InvoiceDetailClientNo` | ClientNo 7291 |
| Sub Total | `invoice` | `InvoiceSubTotal` | 1,392,812,100 |
| PPH 23 | `invoicetax` | `InvoiceTaxDescription`, `InvoiceTaxValue` (negatif) | -27,856,242 |
| VAT (11%) | `invoicetax` | `InvoiceTaxDescription`, `InvoiceTaxValue` | 153,209,331 |
| Total Invoice | `invoice` | `InvoiceTotal` | 1,518,165,189 |
| In Words | `invoice` | `InvoiceTotalTerbilang` | #Indonesia Rupiah One Billion … Nine# |
| Important Information | `invoice` | `AdditionalInformation` (diisi dari `company.CompanyInvoiceInformation`) | 1. Mohon cantumkan … |
| Kotak bank | `bankaccount` | `BankAccountBankName`, `BankAccountBranch`, `BankAccountAddress1`–`4`, `BankAccountSwiftcode`, `BankAccountAccountFor`, `BankAccountNo` via `invoice.BankAccountId` | BankAccountId 2 (Bank Danamon) |
| Penanda tangan | `company` | `CompanyInvoiceSignedBy` via `invoice.InvoiceCompanyId` | Rosiva Dewi |
| Alamat footer | `company` | `CompanyAddress` | Menara Prima Lantai 27 … |

### Tidak tampil di PDF, tapi terkait

| Data | Tabel | Kolom |
|---|---|---|
| Sponsor | `sponsor` | `invoice.InvoiceSponsorId` → `SponsorName` (76 = Sinohydro Corporation Limited) |
| Status invoice | `invoice` | `InvoiceStatus`, `InvoicePaidDate` (`1000-01-01` = belum dibayar), `InvoiceEditStatus` |
| Lampiran | `invoiceattachment` → `attachment` | 325 lampiran untuk invoice 2334 |
| Format nomor invoice | `company` | `CompanyInvoiceNoFormat` = `@YY@@autonumber@/SML/@ROM@/@YYYY@`, nomor terakhir di `CompanyInvoiceLastNo` |
| Template cetak | `company` | `CompanyPrintFormat` = `ProcPrintInvoiceSML` |
| Daftar pajak | `tax` | `TaxName`, `TaxPercentage`, `TaxAdditionReduction` (VAT 11% ADDITION, PPH 23 2% REDUCTION) |

## Aturan penting

### Nomor urut item (No 1, 2, 3…) tidak disimpan

Nomor dihitung saat cetak, berdasarkan urutan `InvoiceDetailId`:

- Baris dengan `Qty > 0` = baris layanan.
- Baris dengan `Qty = 0` = baris nama TKA milik layanan di atasnya.
- Setiap kali baris layanan muncul **setelah** baris nama, nomor item naik satu.
- Baris layanan berturut-turut (tanpa nama di antaranya) masuk ke item yang sama.

### Validasi (invoice 2334)

| Cek | Database | PDF |
|---|---|---|
| Jumlah baris layanan | 54 | 54 |
| Jumlah baris nama | 152 | 152 |
| `SUM(InvoiceDetailSubTotal)` | 1,392,812,100 | Sub Total 1,392,812,100 |
| PPH 23 = 2% × Sub Total | -27,856,242 | -27,856,242 |
| VAT = 11% × Sub Total | 153,209,331 | 153,209,331 |
| Sub Total + PPH + VAT | 1,518,165,189 | Total 1,518,165,189 |

## Catatan data

- **Typo di database** (di PDF revisi sudah dibetulkan, di DB belum):
  - `bankaccount.BankAccountAddress3`: "Jakarta Selatan **1295**" → seharusnya 12950.
  - `invoicedetail.InvoiceDetailDescription`: "Business Visa **Conversation** to ITAS" → Conversion; "**E-Voa**" → E-VoA.
- **Batas tipe kolom**: `InvoiceDetailInvoiceId`, `InvoiceTaxInvoiceId`, dan `InvoiceAttachmentInvoiceId` bertipe `smallint(6)` (maks 32.767), sedangkan `invoice.InvoiceId` bertipe `bigint`. Sekarang ID invoice sekitar 2.334, jadi masih aman.
- **Tabel besar**: `attachment` (~7,7 GB) dan `invoiceattachment` (~2,3 GB) berisi file blob. Jangan `SELECT *`; ambil kolom non-blob saja dan selalu pakai `WHERE`/`LIMIT`.

## Contoh query (read-only)

Header invoice:

```sql
SELECT i.InvoiceId, i.InvoiceNo, i.InvoiceDate, i.InvoiceBilledTo, i.InvoiceNPWP,
       b.BillToAlamatBaris1, b.BillToAlamatBaris2, b.BillToAlamatBaris3, b.BillToAlamatBaris4,
       i.InvoiceSubTotal, i.InvoiceTotal, i.InvoiceTotalTerbilang, i.AdditionalInformation,
       ba.BankAccountBankName, ba.BankAccountBranch,
       ba.BankAccountAddress1, ba.BankAccountAddress2, ba.BankAccountAddress3, ba.BankAccountAddress4,
       ba.BankAccountSwiftcode, ba.BankAccountAccountFor, ba.BankAccountNo,
       c.CompanyInvoiceSignedBy, c.CompanyAddress
FROM invoice i
LEFT JOIN billto b       ON b.BillToId = i.BillToId
LEFT JOIN bankaccount ba ON ba.BankAccountId = i.BankAccountId
LEFT JOIN company c      ON c.CompanyId = i.InvoiceCompanyId
WHERE i.InvoiceNo = '26351/SML/X/2026';
```

Baris item (layanan + nama), urut sesuai cetakan:

```sql
SELECT d.InvoiceDetailId, d.InvoiceDetailDescription, d.InvoiceDetailQty,
       d.InvoiceDetailUnitPrice, d.InvoiceDetailSubTotal,
       d.InvoiceDetailClientNo, cl.ClientName
FROM invoicedetail d
LEFT JOIN client cl ON cl.ClientNo = d.InvoiceDetailClientNo
WHERE d.InvoiceDetailInvoiceId = 2334
ORDER BY d.InvoiceDetailId;
```

Pajak:

```sql
SELECT InvoiceTaxDescription, InvoiceTaxValue
FROM invoicetax
WHERE InvoiceTaxInvoiceId = 2334
ORDER BY InvoiceTaxId;
```

Jalankan lewat helper read-only project:

```bash
python tools/db.py "SELECT InvoiceTaxDescription, InvoiceTaxValue FROM invoicetax WHERE InvoiceTaxInvoiceId = 2334"
```
