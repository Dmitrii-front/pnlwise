import { config } from "./config";
export type ContentPage = {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  sections: [string, string][];
  guide?: boolean;
};
export const contentPages: Record<string, ContentPage> = {
  "bank-statement-to-pnl": {
    title: "Bank Statement to P&L Generator | Create a Profit & Loss Statement",
    description:
      "Upload PDF, CSV or Excel bank statements and turn your transactions into a clear Profit & Loss statement. Review categories and download your P&L in minutes.",
    eyebrow: "FROM BANK ACTIVITY TO BUSINESS CLARITY",
    heading: "Turn Bank Statements Into a P&L",
    intro:
      "Your bank statements already contain much of the story. Bring your business deposits and spending together in a clear, cash-basis Profit & Loss statement.",
    sections: [
      [
        "What your bank statements tell us",
        "A statement records money moving through an account. We extract dates, descriptions, and amounts, then help you decide which transactions belong in business revenue, costs of goods sold, operating expenses, or exclusions. Upload all the business accounts for the same period to make the report more complete.",
      ],
      [
        "How transfers stay out of your income",
        "Moving money from business savings to checking does not create revenue. We look for matching amounts in opposite directions, nearby dates, and transfer descriptions. Possible transfers and overlapping transactions are flagged for confirmation. Unknown incoming payments require a review rather than an automatic revenue assumption.",
      ],
      [
        "You make the final call",
        "Merchant suggestions are a starting point. A restaurant purchase might be a business meal or a personal dinner. Change the category, mark it personal, or apply a rule to matching merchants. Refunds need the original category so they can reduce the corresponding income or expense.",
      ],
      [
        "What a statement-based report cannot show",
        "Bank data alone does not capture every part of an accounting record. Unpaid invoices, unpaid bills, depreciation, inventory adjustments, cash transactions, and activity in omitted accounts can be missing. This tool produces an estimated cash-basis P&L, not an audited or certified financial statement.",
      ],
    ],
  },
  "profit-and-loss-generator": {
    title: "Profit and Loss Generator — Free Preview",
    description:
      "Generate a clear P&L from business bank statements. Review income and expenses, preview your profit, and download PDF and Excel for one payment.",
    eyebrow: "YOUR PROFIT, WITHOUT THE SPREADSHEET",
    heading: "A simpler profit and loss generator.",
    intro:
      "See what your business earned, what it spent, and what remained. Start with the statements you already have.",
    sections: [
      [
        "A useful report starts with the right inputs",
        "Choose a reporting period and upload the statements covering it. Use business accounts where possible. When personal and business activity share an account, review each mixed-purpose transaction carefully before including it. The report will only include transactions within your selected dates.",
      ],
      [
        "From transactions to a clear summary",
        "Revenue appears at the top, followed by direct costs and operating expenses. Gross profit is revenue less direct costs; net profit also subtracts operating expenses and interest. The arithmetic is performed with integer cents, independently of automated categorization.",
      ],
      [
        "Preview before you buy",
        "Review revenue, expenses, gross profit, and net profit for free. The detailed view lets you expand categories to see the underlying merchants. Pay once when you want to download the professional PDF, Excel workbook, and full transaction list. No subscription or accounting setup is required.",
      ],
    ],
  },
  "profit-and-loss-statement-generator": {
    title: "Profit and Loss Statement Generator — PDF & Excel",
    description:
      "Create an organized Profit & Loss statement with revenue, direct costs, operating expenses, and net profit. Review first, then export PDF and Excel.",
    eyebrow: "A REPORT YOU CAN ACTUALLY READ",
    heading: "Create your Profit & Loss statement.",
    intro:
      "Turn account activity into a structured business report, with a summary for the big picture and transaction details when you need them.",
    sections: [
      [
        "What appears in the statement",
        "Your P&L includes sales and other business income, cost of goods sold, gross profit, operating expenses, interest, and net profit. Gross and net margins give context to the dollar totals. If revenue is zero, the report shows an unavailable margin instead of dividing by zero.",
      ],
      [
        "Why category review matters",
        "A bank description does not always explain business purpose. Equipment, owner funding, loan proceeds, and personal transactions may need different treatment from ordinary income and spending. We surface uncertain classifications and let you confirm or change them before creating your final report.",
      ],
      [
        "Two formats for different needs",
        "The PDF is an organized statement for reading and printing. The Excel workbook includes the P&L and a transaction sheet, making it easier to inspect categories and trace totals. Excluded transactions remain visible in the transaction export. The report is estimated and does not claim professional certification.",
      ],
    ],
  },
  "income-statement-generator": {
    title: "Income Statement Generator from Bank Statements",
    description:
      "Create an estimated cash-basis income statement from PDF, CSV, or Excel bank statements. Review classifications and preview net income before downloading.",
    eyebrow: "INCOME STATEMENT, MADE UNDERSTANDABLE",
    heading: "See your income. Understand your profit.",
    intro:
      "An income statement is also called a Profit & Loss statement. It summarizes business income and expenses over a chosen period.",
    sections: [
      [
        "Income is not the same as deposits",
        "A deposit might be payment from a customer, a transfer from another account, borrowed funds, or an owner contribution. Only the relevant business income belongs in revenue. Review deposit descriptions carefully; the size of a payment alone cannot establish what it represents.",
      ],
      [
        "Read from revenue to net income",
        "Start with total revenue. Subtract direct costs to get gross profit, then subtract operating expenses and interest to get net income. A positive result is a profit; a negative result is a loss. These figures describe the selected period and the transactions included in it.",
      ],
      [
        "Choose cash-basis reporting intentionally",
        "This generator uses the dates when money moved through the supplied accounts. It does not create an accrual-basis statement or add unpaid invoices, depreciation, or other non-cash entries. If you need an accrual report, share your records with an accounting professional.",
      ],
    ],
  },
  "profit-and-loss-for-self-employed": {
    title: "Profit and Loss for Self-Employed — Create Your P&L",
    description:
      "Self-employed and need a P&L? Organize business bank statements into revenue, expenses, and profit. No account required before your free preview.",
    eyebrow: "FOR THE BUSINESS YOU BUILT YOURSELF",
    heading: "Self-employed. Clearly organized.",
    intro:
      "You do the work, win the clients, and run the business. Creating a Profit & Loss statement should not require another complicated system.",
    sections: [
      [
        "Separate work from everyday spending",
        "If business income lands in an account you also use personally, begin by identifying the business transactions. Mark personal purchases and owner draws as excluded. For mixed-purpose costs, the appropriate business amount may need a separate adjustment outside this tool. A bank payment alone does not establish tax deductibility.",
      ],
      [
        "Give irregular income a consistent view",
        "Projects and client payments rarely arrive in neat monthly patterns. Upload multiple statements and choose a reporting period that helps you understand the business. Review client deposits as revenue and distinguish them from owner funding, loans, and transfers.",
      ],
      [
        "Keep the supporting records",
        "The transaction export shows the categories behind your totals. Keep invoices, receipts, and other supporting documents with your own records. The generated report is a starting point for understanding your business, not a replacement for professional review or required tax records.",
      ],
    ],
  },
  "profit-and-loss-for-contractors": {
    title: "Profit and Loss for Contractors — Statement to P&L",
    description:
      "Create a contractor P&L from your bank statements. Review materials, subcontractors, vehicle costs, and customer payments before exporting your report.",
    eyebrow: "MORE TIME ON THE JOB. LESS ON PAPERWORK.",
    heading: "A clear P&L for contractors.",
    intro:
      "Bring customer payments, materials, subcontractors, and operating expenses into one organized report for your contracting business.",
    sections: [
      [
        "Distinguish job costs from overhead",
        "Materials and subcontractor payments can belong in direct costs, while rent, insurance, advertising, and software are often operating expenses. The right classification depends on how your business operates. Review each suggestion and keep the category approach consistent throughout the report.",
      ],
      [
        "Review equipment and financing carefully",
        "Borrowing to buy equipment does not make the loan deposit business revenue. Repayment principal is also excluded from ordinary expenses. When you know the interest portion from a lender statement, enter that exact amount using the split action. The tool never guesses a loan split or calculates depreciation.",
      ],
      [
        "Include every relevant account",
        "Contractors sometimes use separate accounts for deposits, operating expenses, and reserves. Include the accounts needed for your selected period. Add a recognizable account label where possible, then review transfers so the same money does not inflate income and spending. This MVP does not provide job-level costing.",
      ],
    ],
  },
  "profit-and-loss-for-small-business": {
    title: "Small Business P&L Generator — No Accounting Setup",
    description:
      "Turn small business bank statements into a simple Profit & Loss report. Multiple files, editable categories, free preview, and PDF or Excel exports.",
    eyebrow: "SMALL BUSINESS. A CLEARER PICTURE.",
    heading: "Know where your business stands.",
    intro:
      "Get a practical view of revenue, expenses, and profit without setting up a full bookkeeping system.",
    sections: [
      [
        "Start with a complete reporting period",
        "Monthly reports can help you inspect recent activity; a quarter or year can reveal a broader picture. Use a consistent date range and upload every statement needed to cover it. Check that the accounts are in USD and that the dates match your intended period.",
      ],
      [
        "Inspect the categories that matter",
        "The report separates direct costs, operating expenses, and interest. Expand a category to inspect the transactions behind it. If your business sells products, purchases of inventory may not equal the cost of items actually sold; an accountant may need to adjust a statement-based report.",
      ],
      [
        "Keep the scope simple",
        `${config.name} focuses on turning uploaded transactions into an estimated cash-basis P&L. It does not connect to your bank, manage invoices, run payroll, or prepare tax returns. You can review the summary for free and purchase downloadable copies when the numbers are ready.`,
      ],
    ],
  },
  "profit-and-loss-for-1099": {
    title: "Profit and Loss for 1099 Workers — Free P&L Preview",
    description:
      "Organize independent contractor income and expenses into a P&L from bank statements. Review your categories and download PDF or Excel with no subscription.",
    eyebrow: "INDEPENDENT WORK, ORGANIZED",
    heading: "Your 1099 work. Your business picture.",
    intro:
      "Client payments tell only part of the story. Bring your business expenses into the picture to see an estimated profit for the period.",
    sections: [
      [
        "A 1099 form and a P&L serve different purposes",
        "An information return reports certain payments. A P&L brings business revenue and expenses together for a defined period. This generator reads bank statements, not 1099 forms, and it does not reconcile tax forms or decide which income is reportable.",
      ],
      [
        "Check client deposits and platform payouts",
        "Deposits can represent individual client payments or platform payouts after fees. A net payout does not necessarily show gross sales or separate processing costs. Compare your statements with your platform records when you need that level of detail; do not invent missing fees.",
      ],
      [
        "Review expenses in context",
        "Subscriptions, office purchases, travel, and meals may have business or personal purposes. Choose categories based on your actual activity, keep the supporting receipts, and exclude personal transactions. This report helps organize the supplied data; it does not calculate tax deductions or file a return.",
      ],
    ],
  },
  "guides/what-is-a-profit-and-loss-statement": {
    title: "What Is a Profit & Loss Statement? A Practical Guide",
    description:
      "Learn what a P&L shows, how revenue and expenses relate to profit, and what a statement-based cash report can and cannot tell you.",
    eyebrow: "THE PNLWISE GUIDE",
    heading: "What is a Profit & Loss statement?",
    intro:
      "A Profit & Loss statement summarizes a business’s income and expenses over a specific period. It is also called an income statement. The goal is to see how much was earned and how much remained after costs.",
    guide: true,
    sections: [
      [
        "Start with the reporting period",
        "A P&L always covers a period: a month, a quarter, a year, or another chosen range. Compare reports over consistent date ranges. A quarterly result and an annual result are not directly comparable without considering the difference in time and any seasonal activity.",
      ],
      [
        "Revenue, direct costs, and gross profit",
        "Revenue is income from the business’s activity. Cost of goods sold represents costs directly associated with delivering products or services, depending on the business. Gross profit is revenue minus those direct costs. For example, $20,000 of revenue and $4,000 of direct costs produce $16,000 of gross profit.",
      ],
      [
        "Operating expenses and net profit",
        "Operating expenses are other costs of running the business, such as rent, software, advertising, or insurance. Subtract operating expenses from gross profit to obtain operating profit, then subtract interest and applicable other expenses to reach net profit. If that $16,000 gross profit is followed by $6,000 of operating expenses and $200 of interest, net profit is $9,800.",
      ],
      [
        "Margins put amounts in context",
        "Gross margin divides gross profit by revenue. Net margin divides net profit by revenue. In the example, net margin is 49%: $9,800 divided by $20,000. Margins cannot be computed meaningfully when revenue is zero, so this tool shows a dash in that case.",
      ],
      [
        "Cash basis versus accrual basis",
        `Cash-basis records generally follow income received and expenses paid. Accrual-basis records generally follow income earned and expenses incurred, even if payment happens later. IRS Publication 583 explains these approaches and why supporting records matter. ${config.name}’s statement-based report follows cash movements in the accounts you provide.`,
      ],
      [
        "Profit is different from your bank balance",
        "Your balance also changes when you borrow, contribute money, withdraw funds as an owner, or transfer money between accounts. Those movements are not automatically P&L income or expenses. Conversely, depreciation and other non-cash accounting entries cannot be read directly from bank transactions.",
      ],
      [
        "Use the report with its limits in mind",
        "A statement-based P&L can organize an incomplete set of records, but it cannot make that set complete. Review the source accounts, dates, and categories. If the report will support an important accounting, financing, or tax decision, consult a qualified professional about any necessary adjustments.",
      ],
    ],
  },
  "guides/how-to-create-pnl-from-bank-statements": {
    title: "How to Create a P&L from Bank Statements",
    description:
      "A step-by-step guide to preparing a statement-based P&L: gather accounts, check transfers, categorize transactions, review totals, and save your report.",
    eyebrow: "THE PNLWISE GUIDE",
    heading: "How to create a P&L from bank statements.",
    intro:
      "Start with complete bank activity, separate business transactions from other money movements, and review the categories. Here is a practical process for getting an estimated cash-basis report.",
    guide: true,
    sections: [
      [
        "1. Choose the period and gather your accounts",
        "Decide which dates the report should cover. Download statements for every relevant business bank account. Prefer CSV or Excel when available, because they preserve the transaction columns. For PDF, use a text-based statement rather than a photo or scan. Keep your original bank records separately.",
      ],
      [
        "2. Read and check the transactions",
        "Upload your files. Verify that dates, descriptions, and amounts match the statements. If the column names are unusual, use the mapping step. If any rows are malformed, correct the source file before continuing; skipping rows can make the report misleading.",
      ],
      [
        "3. Resolve overlaps and transfers",
        "A monthly file and a year-to-date file may contain the same transactions. Confirm suspected duplicates rather than excluding similar payments automatically. Transfers between your own accounts should stay out of revenue and expenses. A description alone can be ambiguous, so inspect both sides when possible.",
      ],
      [
        "4. Separate business activity from owner and loan activity",
        "Identify customer income and ordinary business costs. Exclude owner contributions and draws, personal spending, and loan principal. For loan repayments, use the lender’s exact principal and interest breakdown. An unknown incoming payment should stay under review until you establish what it represents.",
      ],
      [
        "5. Review suggestions and refunds",
        "Check the uncertain items first, then inspect any other categories you want to change. A refund should usually offset the category of its original transaction, subject to your accounting treatment. For a credit refund of a software purchase, selecting the software expense category reduces that expense in this report.",
      ],
      [
        "6. Inspect the P&L and keep your exports",
        "Check the reporting period, total revenue, direct costs, operating expenses, and net profit. Expand categories to trace the totals. Download the PDF for reading and the workbook for transaction detail. Supporting receipts and records remain necessary; an organized summary does not replace them.",
      ],
      [
        "When bank statements are not enough",
        "Statement data may omit cash activity, unpaid invoices, unpaid bills, inventory adjustments, and depreciation. Net platform payouts may also hide fees or gross receipts. IRS Publication 583 discusses recordkeeping, and Publication 538 explains accounting periods and methods. Ask a qualified professional if you need adjustments or a different reporting basis.",
      ],
    ],
  },
};
export const publicRoutes = [
  "/",
  ...Object.keys(contentPages).map((p) => "/" + p),
  "/pricing",
  "/security",
  "/faq",
  "/privacy",
  "/refund-policy",
  "/terms",
];
