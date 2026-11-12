# Synthetic personal-loan form specification

This is a UX research demo. It does not submit a loan application, assess
creditworthiness, contact a lender, connect to a credit bureau or execute a
financial transaction. Do not collect names, contact details, government IDs,
bank-account numbers, passwords or real financial records.

The canonical executable catalogue is `FINANCIAL_FORM_FIELDS` in
`src/contracts.ts`. The table below documents that catalogue; do not copy it
into application code. All ten fields keep their stable IDs, labels, controls
and validation constraints in every layout.

| Section | Field ID | Label | Control type | Options / validation |
|---|---|---|---|---|
| Employment profile | `employmentStatus` | Employment type | Select | Salaried; self-employed; business owner; other |
| Employment profile | `experienceYears` | Years in current work | Number | Integer, 0–50 |
| Monthly cash flow | `monthlyTakeHomeIncome` | Monthly take-home income | INR currency | 0–10,000,000 |
| Monthly cash flow | `otherMonthlyIncome` | Other monthly income | INR currency | 0–10,000,000; enter 0 if none |
| Monthly cash flow | `monthlyExpenses` | Monthly household expenses | INR currency | 0–10,000,000 |
| Existing commitments | `currentMonthlyEmi` | Existing monthly loan payments | INR currency | 0–10,000,000 |
| Existing commitments | `activeLoanCount` | Number of active loans | Number | Integer, 0–20 |
| Loan request | `requestedLoanAmount` | Requested loan amount | INR currency | 10,000–5,000,000 |
| Loan request | `tenureMonths` | Preferred repayment period | Number | Integer, 6–60 |
| Loan request | `loanPurpose` | Purpose of the loan | Select | education; medical; home improvement; business; other |

Currency validation uses the documented numeric bounds; the source
specification does not state whether fractional rupees are permitted and does
not declare required/optional status. Those behaviors must not be inferred or
changed by a generated plan; form validation remains owned by the application.
