import { Link } from 'react-router-dom';
import PdfDataChecks from '../components/PdfDataChecks.jsx';

export default function ClosedRequests() {
  return <>
    <div className="page-head">
      <div><h1>Closed Requests</h1><p className="muted">Find completed data checks and review their saved rows, notes and completion dates.</p></div>
      <Link className="btn" to="/pdf-to-excel">Back to active requests</Link>
    </div>
    <PdfDataChecks view="closed" />
  </>;
}
