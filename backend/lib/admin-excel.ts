import ExcelJS from 'exceljs';
import { excelDate, excelText } from '@/backend/lib/excel-text';
import { ammanYearMonth, toAmmanDateString } from '@/lib/jordan-time';
import { subscriptionDurationLabel, subscriptionTierLabel } from '@/lib/subscription-catalog';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CURRENCY_FORMAT = '"JOD" #,##0.00';
const DATE_FORMAT = 'yyyy-mm-dd';

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (sheet.columnCount > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }
}

function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

async function workbookBase64(workbook: ExcelJS.Workbook): Promise<string> {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

export type UserExportRow = {
  fullName: string;
  email: string;
  age: number | null;
  dateOfBirth: Date | null;
  phone: string;
  userId: string;
  registrationDate: Date | null;
  subscriptionTier: string;
  subscriptionDuration: string;
  subscriptionStatus: string;
  subscriptionStart: Date | null;
  subscriptionExpiry: Date | null;
  walletBalance: number | null;
  referralCode: string;
  signInMethod: string;
  phoneVerified: string;
  profileComplete: string;
};

export async function buildUsersWorkbook(rows: UserExportRow[]): Promise<{ filename: string; base64: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'XPass Admin';
  const sheet = workbook.addWorksheet('Users');
  sheet.columns = [
    { header: 'Full Name', key: 'fullName', width: 28 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Age', key: 'age', width: 10 },
    { header: 'Date of Birth', key: 'dateOfBirth', width: 16 },
    { header: 'Phone Number', key: 'phone', width: 20 },
    { header: 'User ID', key: 'userId', width: 30 },
    { header: 'Registration Date', key: 'registrationDate', width: 18 },
    { header: 'Subscription Tier', key: 'subscriptionTier', width: 20 },
    { header: 'Subscription Duration', key: 'subscriptionDuration', width: 22 },
    { header: 'Subscription Status', key: 'subscriptionStatus', width: 20 },
    { header: 'Subscription Start Date', key: 'subscriptionStart', width: 22 },
    { header: 'Subscription Expiry Date', key: 'subscriptionExpiry', width: 24 },
    { header: 'Wallet Balance (JOD)', key: 'walletBalance', width: 20 },
    { header: 'Referral Code', key: 'referralCode', width: 16 },
    { header: 'Sign-in Method', key: 'signInMethod', width: 18 },
    { header: 'Phone Verified', key: 'phoneVerified', width: 16 },
    { header: 'Profile Complete', key: 'profileComplete', width: 18 },
  ];

  rows.forEach((row) => {
    const added = sheet.addRow({
      fullName: excelText(row.fullName),
      email: excelText(row.email),
      age: row.age,
      dateOfBirth: row.dateOfBirth,
      phone: excelText(row.phone),
      userId: excelText(row.userId),
      registrationDate: row.registrationDate,
      subscriptionTier: excelText(row.subscriptionTier),
      subscriptionDuration: excelText(row.subscriptionDuration),
      subscriptionStatus: excelText(row.subscriptionStatus),
      subscriptionStart: row.subscriptionStart,
      subscriptionExpiry: row.subscriptionExpiry,
      walletBalance: row.walletBalance,
      referralCode: excelText(row.referralCode),
      signInMethod: excelText(row.signInMethod),
      phoneVerified: excelText(row.phoneVerified),
      profileComplete: excelText(row.profileComplete),
    });
    added.getCell('dateOfBirth').numFmt = DATE_FORMAT;
    added.getCell('registrationDate').numFmt = DATE_FORMAT;
    added.getCell('subscriptionStart').numFmt = DATE_FORMAT;
    added.getCell('subscriptionExpiry').numFmt = DATE_FORMAT;
    added.getCell('walletBalance').numFmt = CURRENCY_FORMAT;
  });

  styleHeader(sheet);
  const filename = `XPass_Users_${toAmmanDateString(new Date())}.xlsx`;
  return { filename, base64: await workbookBase64(workbook) };
}

type RevenuePayment = {
  id: string;
  subscriptionId?: string | null;
  userId?: string | null;
  subscriberName?: string | null;
  subscriberEmail?: string | null;
  tier?: string | null;
  duration?: number | null;
  amount?: number | null;
  originalAmount?: number | null;
  discountAmount?: number | null;
  couponCode?: string | null;
  currency?: string | null;
  paymentMethod?: string | null;
  paymentSource?: string | null;
  createdAt?: string | null;
};

type RevenueSummary = {
  summaryCards: {
    thisMonthRevenue: number;
    lastMonthRevenue: number;
    allTimeRevenue: number;
    activeSubscribers: number;
  };
  range: {
    range: string;
    startDate: string | null;
    endDate: string | null;
    totalRevenue: number;
    paymentCount: number;
    byMonth: { monthKey: string; label: string; amount: number }[];
    payments: RevenuePayment[];
  };
};

function rangeLabel(summary: RevenueSummary): string {
  const { range, startDate, endDate } = summary.range;
  const names: Record<string, string> = {
    THIS_MONTH: 'This month',
    LAST_MONTH: 'Last month',
    LAST_3_MONTHS: 'Last 3 months',
    LAST_12_MONTHS: 'Last 12 months',
    ALL_TIME: 'All time',
    CUSTOM: 'Custom range',
  };
  const title = names[range] || range;
  if (startDate && endDate) {
    return `${title} (${toAmmanDateString(new Date(startDate))} to ${toAmmanDateString(new Date(endDate))}, Asia/Amman)`;
  }
  return `${title} (Asia/Amman)`;
}

export function revenueReportFilename(summary: RevenueSummary): string {
  const { range, startDate, endDate } = summary.range;
  const namedMonth = (iso: string | null) => {
    if (!iso) return null;
    const { year, month } = ammanYearMonth(new Date(iso));
    return { year, month };
  };

  if (range === 'THIS_MONTH' || range === 'LAST_MONTH') {
    const month = namedMonth(startDate);
    if (month) return `XPass_Revenue_${MONTH_NAMES[month.month - 1]}_${month.year}.xlsx`;
  }

  if (range === 'CUSTOM' && startDate && endDate) {
    const start = namedMonth(startDate);
    const end = namedMonth(endDate);
    if (start && end && start.year === end.year && start.month === end.month) {
      return `XPass_Revenue_${MONTH_NAMES[start.month - 1]}_${start.year}.xlsx`;
    }
  }

  return `XPass_Revenue_${range}_${toAmmanDateString(new Date())}.xlsx`;
}

export async function buildRevenueWorkbook(summary: RevenueSummary): Promise<{ filename: string; base64: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'XPass Admin';
  const payments = summary.range.payments || [];
  const currencies = Array.from(new Set(payments.map((payment) => payment.currency || 'JOD')));

  const summarySheet = workbook.addWorksheet('Monthly Summary');
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 62 },
    { header: 'Value', key: 'value', width: 42 },
  ];
  const summaryRows: { field: string; value: string | number | Date | null }[] = [
    { field: 'Reporting period', value: rangeLabel(summary) },
    { field: 'Generated on (Asia/Amman)', value: toAmmanDateString(new Date()) },
    { field: 'Currency', value: currencies.length === 1 ? currencies[0] : currencies.join(', ') },
    { field: 'Selected period revenue', value: summary.range.totalRevenue },
    { field: 'Payments in selected period', value: summary.range.paymentCount },
    { field: 'Dashboard card: This Month', value: summary.summaryCards.thisMonthRevenue },
    { field: 'Dashboard card: Last Month', value: summary.summaryCards.lastMonthRevenue },
    { field: 'Dashboard card: All Time', value: summary.summaryCards.allTimeRevenue },
    { field: 'Dashboard card: Active subscribers', value: summary.summaryCards.activeSubscribers },
    {
      field: 'Notes',
      value:
        'Selected period revenue is the Revenue dashboard total for the current filter. Refunded, unpaid, pending, and zero-amount subscriptions are excluded, matching that dashboard. There is no separate refunds ledger. New-subscription and renewal revenue are not tracked separately. Dashboard month cards keep their existing definitions and are not added into the selected period total.',
    },
  ];
  summary.range.byMonth.forEach((month) => {
    summaryRows.push({ field: `Month bucket: ${month.label}`, value: month.amount });
  });
  summaryRows.forEach((row) => {
    const added = summarySheet.addRow(row);
    if (typeof row.value === 'number' && row.field !== 'Payments in selected period' && row.field !== 'Dashboard card: Active subscribers') {
      added.getCell(2).numFmt = CURRENCY_FORMAT;
    }
  });
  styleHeader(summarySheet);

  const breakdown = workbook.addWorksheet('Revenue Breakdown');
  breakdown.columns = [
    { header: 'Subscription Tier', key: 'tier', width: 22 },
    { header: 'Subscription Duration', key: 'duration', width: 24 },
    { header: 'Payments', key: 'payments', width: 14 },
    { header: 'Revenue', key: 'revenue', width: 18 },
  ];
  const groups = new Map<string, { tier: string; duration: string; payments: number; revenue: number }>();
  payments.forEach((payment) => {
    const tier = payment.tier ? subscriptionTierLabel(payment.tier) : '';
    const duration = typeof payment.duration === 'number' ? subscriptionDurationLabel(payment.duration) : '';
    const key = `${tier}|${duration}`;
    const current = groups.get(key) || { tier, duration, payments: 0, revenue: 0 };
    current.payments += 1;
    current.revenue += payment.amount || 0;
    groups.set(key, current);
  });
  Array.from(groups.values())
    .sort((a, b) => b.revenue - a.revenue)
    .forEach((group) => breakdown.addRow(group));
  const breakdownTotal = breakdown.addRow({
    tier: 'Total',
    duration: '',
    payments: payments.length,
    revenue: summary.range.totalRevenue,
  });
  breakdownTotal.font = { bold: true };
  styleHeader(breakdown);
  breakdown.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: breakdown.rowCount, column: 4 },
  };
  breakdown.getColumn(4).numFmt = CURRENCY_FORMAT;

  const sourceStart = breakdown.rowCount + 2;
  breakdown.getCell(sourceStart, 1).value = 'Payment source';
  breakdown.getCell(sourceStart, 2).value = 'Payments';
  breakdown.getCell(sourceStart, 3).value = 'Revenue';
  breakdown.getRow(sourceStart).font = { bold: true };
  const sources = new Map<string, { payments: number; revenue: number }>();
  payments.forEach((payment) => {
    const source = payment.paymentSource || payment.paymentMethod || 'Subscription';
    const current = sources.get(source) || { payments: 0, revenue: 0 };
    current.payments += 1;
    current.revenue += payment.amount || 0;
    sources.set(source, current);
  });
  let sourceRow = sourceStart;
  sources.forEach((value, source) => {
    sourceRow += 1;
    breakdown.getCell(sourceRow, 1).value = excelText(source);
    breakdown.getCell(sourceRow, 2).value = value.payments;
    breakdown.getCell(sourceRow, 3).value = value.revenue;
    breakdown.getCell(sourceRow, 3).numFmt = CURRENCY_FORMAT;
  });
  sourceRow += 1;
  breakdown.getCell(sourceRow, 1).value = 'Total';
  breakdown.getCell(sourceRow, 2).value = payments.length;
  breakdown.getCell(sourceRow, 3).value = summary.range.totalRevenue;
  breakdown.getCell(sourceRow, 3).numFmt = CURRENCY_FORMAT;
  breakdown.getRow(sourceRow).font = { bold: true };

  const transactions = workbook.addWorksheet('Transactions');
  transactions.columns = [
    { header: 'Transaction Date', key: 'createdAt', width: 18 },
    { header: 'Transaction ID', key: 'id', width: 28 },
    { header: 'Subscription ID', key: 'subscriptionId', width: 28 },
    { header: 'User ID', key: 'userId', width: 28 },
    { header: 'Subscriber Name', key: 'subscriberName', width: 26 },
    { header: 'Email', key: 'subscriberEmail', width: 32 },
    { header: 'Subscription Tier', key: 'tier', width: 18 },
    { header: 'Subscription Duration', key: 'duration', width: 22 },
    { header: 'Original Amount', key: 'originalAmount', width: 18 },
    { header: 'Discount', key: 'discountAmount', width: 14 },
    { header: 'Coupon', key: 'couponCode', width: 16 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Currency', key: 'currency', width: 12 },
    { header: 'Payment Method', key: 'paymentSource', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  payments.forEach((payment) => {
    const added = transactions.addRow({
      createdAt: excelDate(payment.createdAt),
      id: excelText(payment.id),
      subscriptionId: excelText(payment.subscriptionId),
      userId: excelText(payment.userId),
      subscriberName: excelText(payment.subscriberName),
      subscriberEmail: excelText(payment.subscriberEmail),
      tier: excelText(payment.tier ? subscriptionTierLabel(payment.tier) : ''),
      duration: excelText(typeof payment.duration === 'number' ? subscriptionDurationLabel(payment.duration) : ''),
      originalAmount: payment.originalAmount ?? null,
      discountAmount: payment.discountAmount ?? null,
      couponCode: excelText(payment.couponCode),
      amount: payment.amount ?? null,
      currency: excelText(payment.currency || 'JOD'),
      paymentSource: excelText(payment.paymentSource || payment.paymentMethod),
      status: 'Paid',
    });
    added.getCell('createdAt').numFmt = DATE_FORMAT;
    added.getCell('originalAmount').numFmt = CURRENCY_FORMAT;
    added.getCell('discountAmount').numFmt = CURRENCY_FORMAT;
    added.getCell('amount').numFmt = CURRENCY_FORMAT;
  });
  const totalRow = transactions.addRow({
    createdAt: null,
    id: 'Total',
    amount: summary.range.totalRevenue,
    currency: currencies.length === 1 ? currencies[0] : '',
    status: '',
  });
  totalRow.font = { bold: true };
  totalRow.getCell('amount').numFmt = CURRENCY_FORMAT;
  styleHeader(transactions);
  setWidths(transactions, [18, 28, 28, 28, 26, 32, 18, 22, 18, 14, 16, 16, 12, 18, 12]);

  return {
    filename: revenueReportFilename(summary),
    base64: await workbookBase64(workbook),
  };
}
