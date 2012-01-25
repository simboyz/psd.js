var arraySum;

arraySum = function(arr, from, to) {
  var i, sum;
  if (from == null) from = 0;
  if (to == null) to = arr.length - 1;
  sum = 0;
  for (i = from; from <= to ? i <= to : i >= to; from <= to ? i++ : i--) {
    sum += parseInt(arr[i], 10);
  }
  return sum;
};