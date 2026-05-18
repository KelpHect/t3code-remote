package codes.t3.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(T3SecureStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
