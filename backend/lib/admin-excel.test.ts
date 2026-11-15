import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { excelText } from './excel-text';
import { buildRevenueWorkbook, buildUsersWorkbook } from './admin-excel';

assert.equal(excelText('=SUM(A1)'), "'=SUM(A1)");
assert.equal(excelText('+962790000000'), "'+962790000000");
assert.equal(excelText('Sara'), 'Sara');
assert.equal(excelText(null), '');

async function main() {
  const usersFile = await buildUsersWorkbook([
    {
      fullName: '=cmd',
      email: 'sara@example.com',
      age: 29,
      dateOfBirth: null,
      phone: '+962790000000',
      userId: 'user-1',
      registrationDate: new Date('2026-01-15T00:00:00Z'),
      subscriptionTier: 'Gold',
      subscriptionDuration: '3 months',
      subscriptionStatus: 'Active',
      subscriptionStart: new Date('2026-10-01T00:00:00Z'),
      subscriptionExpiry: new Date('2027-01-01T00:00:00Z'),
      walletBalance: 12.5,
      referralCode: 'ABC',
      signInMethod: 'Email',
      phoneVerified: 'Yes',
      profileComplete: 'Yes',
    },
  ]);
  assert.equal(usersFile.filename.startsWith('XPass_Users_'), true);
  assert.equal(usersFile.filename.endsWith('.xlsx'), true);

  const revenueFile = await buildRevenueWorkbook({
    summaryCards: {
      thisMonthRevenue: 20,
      lastMonthRevenue: 10,
      allTimeRevenue: 30,
      activeSubscribers: 2,
    },
    range: {
      range: 'THIS_MONTH',
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-31T23:59:59.000Z',
      totalRevenue: 20,
      paymentCount: 1,
      byMonth: [{ monthKey: '2026-10', label: 'Oct 2026', amount: 20 }],
      payments: [
        {
          id: 'pay-1',
          userId: 'user-1',
          subscriberName: 'Sara',
          subscriberEmail: 'sara@example.com',
          tier: 'gold',
          duration: 3,
          amount: 20,
          originalAmount: 25,
          discountAmount: 5,
          couponCode: 'SAVE',
          currency: 'JOD',
          paymentSource: 'Card',
          createdAt: '2026-10-04T10:00:00.000Z',
        },
      ],
    },
  });
  assert.equal(revenueFile.filename.includes('XPass_Revenue_'), true);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(revenueFile.base64, 'base64') as unknown as ExcelJS.Buffer);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ['Monthly Summary', 'Revenue Breakdown', 'Transactions']
  );
  const usersWorkbook = new ExcelJS.Workbook();
  await usersWorkbook.xlsx.load(Buffer.from(usersFile.base64, 'base64') as unknown as ExcelJS.Buffer);
  assert.equal(usersWorkbook.getWorksheet('Users')?.getRow(1).font?.bold, true);
  assert.equal(usersWorkbook.getWorksheet('Users')?.getCell('A2').value, "'=cmd");

  console.log('excel checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
