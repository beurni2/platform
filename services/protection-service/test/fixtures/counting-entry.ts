// TEST-ONLY entry: the CURRENT Worker and book, behind the counting window.
import worker, { FondsDO as BookOfThisRelease } from '../../worker/index.js';
import { countingClass } from './counting.js';

export const FondsDO = countingClass(BookOfThisRelease);
export default worker;
