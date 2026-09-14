import {writeFile} from 'node:fs/promises';
import {sampleReport} from '../lib/domain';
import {pdfExport,xlsxExport} from '../lib/export';
await writeFile('outputs/sample-report.pdf',await pdfExport(sampleReport()));
await writeFile('outputs/sample-report.xlsx',await xlsxExport(sampleReport()));
