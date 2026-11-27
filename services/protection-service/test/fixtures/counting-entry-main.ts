// TEST-ONLY entry: the FROZEN main ae0b76e Worker and book, behind the same window.
import worker, { FondsDO as BookOfMain } from './main-ae0b76e/index.js';
import { countingClass } from './counting.js';

export const FondsDO = countingClass(BookOfMain);
export default worker;
