-- CreateEnum
CREATE TYPE "PeriodeUnit" AS ENUM ('MONTHS', 'DAYS');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('ADDITION', 'REDUCTION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'FINAL', 'PAID');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DONE');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('TO', 'CC', 'BCC');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_menus" (
    "role_id" INTEGER NOT NULL,
    "menu_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "allow_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_menus_pkey" PRIMARY KEY ("role_id","menu_key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "fullname" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_to" (
    "id" SERIAL NOT NULL,
    "kode_perusahaan" TEXT,
    "company_name" TEXT NOT NULL,
    "npwp" TEXT,
    "alamat_1" TEXT,
    "alamat_2" TEXT,
    "alamat_3" TEXT,
    "alamat_4" TEXT,

    CONSTRAINT "bill_to_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_projects" (
    "id" SERIAL NOT NULL,
    "sponsor_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "bill_to_id" INTEGER,

    CONSTRAINT "sponsor_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keperluan" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "periode" INTEGER NOT NULL DEFAULT 0,
    "periode_in" "PeriodeUnit" NOT NULL DEFAULT 'MONTHS',
    "sumber_data" TEXT NOT NULL DEFAULT 'TANGGAL TERBIT DOKUMEN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "harga" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reminder_pembuatan_invoice" INTEGER DEFAULT 14,
    "reminder_pembayaran_invoice" INTEGER DEFAULT 30,
    "reminder_expired_dokumen" INTEGER DEFAULT 60,
    "reminder_expired_2nd" INTEGER DEFAULT 14,

    CONSTRAINT "keperluan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" SERIAL NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch" TEXT,
    "address" TEXT,
    "swiftcode" TEXT,
    "account_for" TEXT,
    "account_no" TEXT,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "last_no" INTEGER NOT NULL DEFAULT 0,
    "no_format" TEXT NOT NULL DEFAULT '{NO}/SML/{ROMAWI}/{YYYY}',
    "bank_account_id" INTEGER,
    "invoice_information" TEXT,
    "signed_by" TEXT,
    "signed_title" TEXT DEFAULT 'Finance',

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DECIMAL(6,3) NOT NULL,
    "addition_reduction" "TaxType" NOT NULL DEFAULT 'ADDITION',

    CONSTRAINT "taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "tanggal_permohonan" DATE,
    "sponsor_id" INTEGER,
    "project_id" INTEGER,
    "name" TEXT NOT NULL,
    "no_paspor" TEXT,
    "tanggal_lahir" DATE,
    "keperluan_id" INTEGER,
    "no_rptka" TEXT,
    "pembayaran_pnbp" DATE,
    "permohonan_hari_ke3" TEXT,
    "tanggal_proses_selesai" DATE,
    "tanggal_terbit_dokumen" DATE,
    "tanggal_masuk_last_exp" DATE,
    "expired_dokumen" DATE,
    "epo" TEXT,
    "no_invoice" TEXT,
    "tanggal_invoice" DATE,
    "tanggal_pembayaran_invoice" DATE,
    "proses_perpanjangan" TEXT,
    "sktt" TEXT,
    "stm" TEXT,
    "status" TEXT,
    "keterangan_tka" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_reason" TEXT,
    "invoice_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_attachments" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime" TEXT,
    "size" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_logs" (
    "id" SERIAL NOT NULL,
    "history_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_name" TEXT,
    "client_id" INTEGER,
    "action" TEXT NOT NULL,
    "snapshot" JSONB,

    CONSTRAINT "client_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "user_name" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "no" TEXT,
    "company_id" INTEGER,
    "sponsor_id" INTEGER,
    "bill_to_id" INTEGER,
    "npwp" TEXT,
    "date" DATE,
    "paid_date" DATE,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "sub_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_terbilang" TEXT,
    "information" TEXT,
    "bank_account_id" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_groups" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_group_clients" (
    "group_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_group_clients_pkey" PRIMARY KEY ("group_id","client_id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "keperluan_id" INTEGER,
    "qty" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sub_total" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_taxes" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "tax_id" INTEGER,
    "description" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_attachments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime" TEXT,
    "size" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_requests" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requested_by" TEXT,
    "decided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "update_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kontrak" (
    "id" SERIAL NOT NULL,
    "date" DATE,
    "bill_to_id" INTEGER NOT NULL,
    "alamat" TEXT,
    "isi" TEXT,

    CONSTRAINT "kontrak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kontrak_items" (
    "id" SERIAL NOT NULL,
    "kontrak_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "keperluan_id" INTEGER,
    "description" TEXT NOT NULL,
    "duration" TEXT,
    "price" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "kontrak_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "body" TEXT,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_recipients" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "type" "RecipientType" NOT NULL DEFAULT 'TO',
    "is_accounting" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "ref_key" TEXT,
    "subject" TEXT,
    "recipients" TEXT,
    "item_count" INTEGER,
    "status" TEXT,
    "error" TEXT,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_no_paspor_idx" ON "clients"("no_paspor");

-- CreateIndex
CREATE INDEX "clients_expired_dokumen_idx" ON "clients"("expired_dokumen");

-- CreateIndex
CREATE INDEX "clients_is_archived_idx" ON "clients"("is_archived");

-- CreateIndex
CREATE INDEX "client_logs_client_id_idx" ON "client_logs"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_no_key" ON "invoices"("no");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_code_key" ON "email_templates"("code");

-- CreateIndex
CREATE INDEX "reminder_logs_ref_key_idx" ON "reminder_logs"("ref_key");

-- AddForeignKey
ALTER TABLE "role_menus" ADD CONSTRAINT "role_menus_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_projects" ADD CONSTRAINT "sponsor_projects_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_projects" ADD CONSTRAINT "sponsor_projects_bill_to_id_fkey" FOREIGN KEY ("bill_to_id") REFERENCES "bill_to"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "sponsor_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_keperluan_id_fkey" FOREIGN KEY ("keperluan_id") REFERENCES "keperluan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_attachments" ADD CONSTRAINT "client_attachments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bill_to_id_fkey" FOREIGN KEY ("bill_to_id") REFERENCES "bill_to"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_groups" ADD CONSTRAINT "invoice_groups_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_group_clients" ADD CONSTRAINT "invoice_group_clients_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "invoice_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_group_clients" ADD CONSTRAINT "invoice_group_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "invoice_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_keperluan_id_fkey" FOREIGN KEY ("keperluan_id") REFERENCES "keperluan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "update_requests" ADD CONSTRAINT "update_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kontrak" ADD CONSTRAINT "kontrak_bill_to_id_fkey" FOREIGN KEY ("bill_to_id") REFERENCES "bill_to"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kontrak_items" ADD CONSTRAINT "kontrak_items_kontrak_id_fkey" FOREIGN KEY ("kontrak_id") REFERENCES "kontrak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kontrak_items" ADD CONSTRAINT "kontrak_items_keperluan_id_fkey" FOREIGN KEY ("keperluan_id") REFERENCES "keperluan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
