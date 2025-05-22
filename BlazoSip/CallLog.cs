namespace BlazoSip
{
    public class CallLog
    {
        public DateTime? Time { get; set; }
        public string Direction { get; set; } = "";
        public string Number { get; set; } = "";
        public string Status { get; set; } = "";
    }

}
